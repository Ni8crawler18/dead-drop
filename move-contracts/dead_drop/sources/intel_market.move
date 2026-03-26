/// Dead Drop Intel Market — anonymous information trading on Smart Storage Units.
///
/// Providers list encrypted intel with an item price. Buyers pay to receive the
/// decryption key via an on-chain event. A reputation system tracks provider accuracy.
///
/// Flow:
/// 1. Admin configures the market (payment type, listing fee, rating window)
/// 2. Provider calls `create_listing` — encrypted intel + price stored on-chain
/// 3. Buyer calls `purchase_intel` — pays items, receives decryption key via event
/// 4. Buyer calls `rate_intel` — affects provider reputation score
module dead_drop::intel_market;

use dead_drop::config::{Self, AdminCap, DeadDropAuth, DeadDropConfig};
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};
use sui::vec_map::{Self, VecMap};
use world::{
    access::OwnerCap,
    character::Character,
    storage_unit::StorageUnit,
};

// === Errors ===
#[error(code = 0)]
const ENoMarketConfig: vector<u8> = b"Missing MarketConfig on DeadDropConfig";
#[error(code = 1)]
const EListingNotFound: vector<u8> = b"Listing index out of bounds";
#[error(code = 2)]
const EListingAlreadyPurchased: vector<u8> = b"Listing has already been purchased";
#[error(code = 3)]
const EListingExpired: vector<u8> = b"Listing has expired";
#[error(code = 4)]
const ESelfPurchase: vector<u8> = b"Cannot purchase your own listing";
#[error(code = 5)]
const ENotBuyer: vector<u8> = b"Only the buyer can rate this listing";
#[error(code = 6)]
const ERatingWindowExpired: vector<u8> = b"Rating window has expired";
#[error(code = 7)]
const EAlreadyRated: vector<u8> = b"Listing has already been rated";
#[error(code = 8)]
const ENotProvider: vector<u8> = b"Only the listing provider can cancel";
#[error(code = 9)]
const EListingNotActive: vector<u8> = b"Listing is not active";
#[error(code = 10)]
const EEmptyIntel: vector<u8> = b"Encrypted intel cannot be empty";
#[error(code = 11)]
const EEmptyKey: vector<u8> = b"Decryption key cannot be empty";
#[error(code = 12)]
const EZeroPrice: vector<u8> = b"Price quantity must be greater than zero";
#[error(code = 13)]
const EListingNotPurchased: vector<u8> = b"Listing has not been purchased yet";

// === Constants ===
const STATUS_ACTIVE: u8 = 0;
const STATUS_PURCHASED: u8 = 1;
const STATUS_CANCELLED: u8 = 2;

// === Config Structs ===

/// Market-wide configuration stored as a dynamic field on DeadDropConfig.
public struct MarketConfig has drop, store {
    /// Default rating window in ms after purchase (e.g. 24 hours)
    rating_window_ms: u64,
    /// Maximum number of active listings per provider (0 = unlimited)
    max_listings_per_provider: u64,
}

/// Dynamic-field key for MarketConfig.
public struct MarketConfigKey has copy, drop, store {}

// === Core Structs ===

/// The intel registry — a shared object holding all listings and reputation data.
public struct IntelRegistry has key {
    id: UID,
    /// All listings (append-only, indexed by position)
    listings: vector<IntelListing>,
    /// Provider address -> reputation scores
    reputations: Table<address, Reputation>,
    /// Total listings created (for stats)
    total_listings: u64,
    /// Total purchases completed
    total_purchases: u64,
}

/// A single intel listing.
public struct IntelListing has store {
    /// Provider's address
    provider: address,
    /// AES-encrypted intel payload (opaque bytes)
    encrypted_intel: vector<u8>,
    /// AES decryption key — revealed to buyer via event on purchase
    decryption_key: vector<u8>,
    /// Category tag for filtering (e.g. "coordinates", "fleet", "trade")
    category: vector<u8>,
    /// Human-readable title (unencrypted)
    title: vector<u8>,
    /// Item type_id required as payment
    price_type_id: u64,
    /// Item quantity required as payment
    price_quantity: u32,
    /// Expiry timestamp in ms (0 = no expiry)
    expires_at_ms: u64,
    /// Current status: 0=active, 1=purchased, 2=cancelled
    status: u8,
    /// Buyer address (set on purchase)
    buyer: address,
    /// Timestamp of purchase (for rating window)
    purchased_at_ms: u64,
    /// Whether buyer has rated
    rated: bool,
    /// Creation timestamp
    created_at_ms: u64,
}

/// Provider reputation tracking.
public struct Reputation has store {
    total_sales: u64,
    positive_ratings: u64,
    negative_ratings: u64,
    total_earnings_quantity: u64,
}

// === Events ===

/// Emitted when a new listing is created.
public struct ListingCreated has copy, drop {
    listing_index: u64,
    provider: address,
    category: vector<u8>,
    title: vector<u8>,
    price_type_id: u64,
    price_quantity: u32,
    expires_at_ms: u64,
}

/// Emitted on purchase — contains the decryption key.
/// The buyer watches for this event to decrypt the intel.
public struct IntelPurchased has copy, drop {
    listing_index: u64,
    buyer: address,
    provider: address,
    decryption_key: vector<u8>,
}

/// Emitted when a listing is rated.
public struct IntelRated has copy, drop {
    listing_index: u64,
    provider: address,
    buyer: address,
    positive: bool,
}

/// Emitted when a listing is cancelled.
public struct ListingCancelled has copy, drop {
    listing_index: u64,
    provider: address,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let registry = IntelRegistry {
        id: object::new(ctx),
        listings: vector::empty(),
        reputations: table::new(ctx),
        total_listings: 0,
        total_purchases: 0,
    };
    transfer::share_object(registry);
}

// === Admin Functions ===

/// Configure market parameters.
public fun set_market_config(
    config: &mut DeadDropConfig,
    admin_cap: &AdminCap,
    rating_window_ms: u64,
    max_listings_per_provider: u64,
) {
    config.set_rule<MarketConfigKey, MarketConfig>(
        admin_cap,
        MarketConfigKey {},
        MarketConfig { rating_window_ms, max_listings_per_provider },
    );
}

// === Provider Functions ===

/// Create a new intel listing.
///
/// The provider supplies encrypted intel and a decryption key (both as raw bytes).
/// The decryption key is stored on-chain but only revealed to the buyer via event.
public fun create_listing(
    registry: &mut IntelRegistry,
    encrypted_intel: vector<u8>,
    decryption_key: vector<u8>,
    category: vector<u8>,
    title: vector<u8>,
    price_type_id: u64,
    price_quantity: u32,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!encrypted_intel.is_empty(), EEmptyIntel);
    assert!(!decryption_key.is_empty(), EEmptyKey);
    assert!(price_quantity > 0, EZeroPrice);

    let provider = ctx.sender();
    let now = clock.timestamp_ms();
    let listing_index = registry.listings.length();

    let listing = IntelListing {
        provider,
        encrypted_intel,
        decryption_key,
        category,
        title,
        price_type_id,
        price_quantity,
        expires_at_ms,
        status: STATUS_ACTIVE,
        buyer: @0x0,
        purchased_at_ms: 0,
        rated: false,
        created_at_ms: now,
    };

    registry.listings.push_back(listing);
    registry.total_listings = registry.total_listings + 1;

    // Initialize reputation if first listing
    if (!registry.reputations.contains(provider)) {
        registry.reputations.add(provider, Reputation {
            total_sales: 0,
            positive_ratings: 0,
            negative_ratings: 0,
            total_earnings_quantity: 0,
        });
    };

    event::emit(ListingCreated {
        listing_index,
        provider,
        category,
        title,
        price_type_id,
        price_quantity,
        expires_at_ms,
    });
}

/// Cancel an active listing. Only the provider can cancel.
public fun cancel_listing(
    registry: &mut IntelRegistry,
    listing_index: u64,
    ctx: &mut TxContext,
) {
    assert!(listing_index < registry.listings.length(), EListingNotFound);

    let listing = &mut registry.listings[listing_index];
    assert!(listing.provider == ctx.sender(), ENotProvider);
    assert!(listing.status == STATUS_ACTIVE, EListingNotActive);

    listing.status = STATUS_CANCELLED;

    event::emit(ListingCancelled {
        listing_index,
        provider: listing.provider,
    });
}

// === Buyer Functions ===

/// Purchase intel by depositing the required items into the storage unit.
///
/// On success, emits `IntelPurchased` containing the decryption key.
/// The buyer should listen for this event to retrieve the key.
public fun purchase_intel<T: key>(
    registry: &mut IntelRegistry,
    config: &DeadDropConfig,
    storage_unit: &mut StorageUnit,
    character: &Character,
    player_inventory_owner_cap: &OwnerCap<T>,
    listing_index: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(listing_index < registry.listings.length(), EListingNotFound);

    let listing = &mut registry.listings[listing_index];
    let buyer = ctx.sender();
    let now = clock.timestamp_ms();

    assert!(listing.status == STATUS_ACTIVE, EListingAlreadyPurchased);
    assert!(listing.provider != buyer, ESelfPurchase);
    if (listing.expires_at_ms > 0) {
        assert!(now <= listing.expires_at_ms, EListingExpired);
    };

    // Withdraw payment items from buyer's inventory
    let payment = storage_unit.withdraw_by_owner<T>(
        character,
        player_inventory_owner_cap,
        listing.price_type_id,
        listing.price_quantity,
        ctx,
    );

    // Deposit payment into the Dead Drop storage unit (held for provider)
    storage_unit.deposit_item<DeadDropAuth>(
        character,
        payment,
        config::auth(),
        ctx,
    );

    // Update listing state
    listing.status = STATUS_PURCHASED;
    listing.buyer = buyer;
    listing.purchased_at_ms = now;

    // Update registry stats
    registry.total_purchases = registry.total_purchases + 1;

    // Update provider reputation
    let rep = &mut registry.reputations[listing.provider];
    rep.total_sales = rep.total_sales + 1;
    rep.total_earnings_quantity = rep.total_earnings_quantity + (listing.price_quantity as u64);

    // Emit event with decryption key — this is how the buyer gets the key
    event::emit(IntelPurchased {
        listing_index,
        buyer,
        provider: listing.provider,
        decryption_key: listing.decryption_key,
    });
}

/// Rate purchased intel. Must be called within the rating window.
public fun rate_intel(
    registry: &mut IntelRegistry,
    config: &DeadDropConfig,
    listing_index: u64,
    positive: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(listing_index < registry.listings.length(), EListingNotFound);
    assert!(config.has_rule<MarketConfigKey>(MarketConfigKey {}), ENoMarketConfig);

    let market_cfg = config.borrow_rule<MarketConfigKey, MarketConfig>(MarketConfigKey {});
    let listing = &mut registry.listings[listing_index];
    let now = clock.timestamp_ms();

    assert!(listing.status == STATUS_PURCHASED, EListingNotPurchased);
    assert!(listing.buyer == ctx.sender(), ENotBuyer);
    assert!(!listing.rated, EAlreadyRated);

    // Check rating window
    if (market_cfg.rating_window_ms > 0) {
        assert!(
            now <= listing.purchased_at_ms + market_cfg.rating_window_ms,
            ERatingWindowExpired,
        );
    };

    listing.rated = true;

    // Update provider reputation
    let rep = &mut registry.reputations[listing.provider];
    if (positive) {
        rep.positive_ratings = rep.positive_ratings + 1;
    } else {
        rep.negative_ratings = rep.negative_ratings + 1;
    };

    event::emit(IntelRated {
        listing_index,
        provider: listing.provider,
        buyer: listing.buyer,
        positive,
    });
}

// === View Functions ===

public fun total_listings(registry: &IntelRegistry): u64 {
    registry.total_listings
}

public fun total_purchases(registry: &IntelRegistry): u64 {
    registry.total_purchases
}

public fun listing_count(registry: &IntelRegistry): u64 {
    registry.listings.length()
}

public fun listing_provider(registry: &IntelRegistry, index: u64): address {
    registry.listings[index].provider
}

public fun listing_title(registry: &IntelRegistry, index: u64): vector<u8> {
    registry.listings[index].title
}

public fun listing_category(registry: &IntelRegistry, index: u64): vector<u8> {
    registry.listings[index].category
}

public fun listing_price_type_id(registry: &IntelRegistry, index: u64): u64 {
    registry.listings[index].price_type_id
}

public fun listing_price_quantity(registry: &IntelRegistry, index: u64): u32 {
    registry.listings[index].price_quantity
}

public fun listing_status(registry: &IntelRegistry, index: u64): u8 {
    registry.listings[index].status
}

public fun listing_expires_at(registry: &IntelRegistry, index: u64): u64 {
    registry.listings[index].expires_at_ms
}

public fun listing_buyer(registry: &IntelRegistry, index: u64): address {
    registry.listings[index].buyer
}

public fun provider_total_sales(registry: &IntelRegistry, provider: address): u64 {
    if (!registry.reputations.contains(provider)) { return 0 };
    registry.reputations[provider].total_sales
}

public fun provider_positive_ratings(registry: &IntelRegistry, provider: address): u64 {
    if (!registry.reputations.contains(provider)) { return 0 };
    registry.reputations[provider].positive_ratings
}

public fun provider_negative_ratings(registry: &IntelRegistry, provider: address): u64 {
    if (!registry.reputations.contains(provider)) { return 0 };
    registry.reputations[provider].negative_ratings
}

public fun rating_window_ms(config: &DeadDropConfig): u64 {
    assert!(config.has_rule<MarketConfigKey>(MarketConfigKey {}), ENoMarketConfig);
    config.borrow_rule<MarketConfigKey, MarketConfig>(MarketConfigKey {}).rating_window_ms
}
