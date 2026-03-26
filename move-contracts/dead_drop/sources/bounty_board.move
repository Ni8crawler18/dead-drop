/// Dead Drop Bounty Board — request-side of the intel market.
///
/// Players post bounties requesting specific intel. Anyone can claim a bounty
/// by providing the requested intel. Creates a two-sided information market.
///
/// Flow:
/// 1. Poster deposits reward items into storage unit + creates bounty description
/// 2. Claimant provides encrypted intel + decryption key
/// 3. Poster reviews and accepts/rejects the claim
/// 4. On acceptance, reward transfers to claimant, intel revealed to poster
module dead_drop::bounty_board;

use dead_drop::config::{Self, AdminCap, DeadDropAuth, DeadDropConfig};
use sui::clock::Clock;
use sui::event;
use world::{
    access::OwnerCap,
    character::Character,
    storage_unit::StorageUnit,
};

// === Errors ===
#[error(code = 0)]
const EBountyNotFound: vector<u8> = b"Bounty index out of bounds";
#[error(code = 1)]
const EBountyNotOpen: vector<u8> = b"Bounty is not open";
#[error(code = 2)]
const EBountyAlreadyClaimed: vector<u8> = b"Bounty already has a pending claim";
#[error(code = 3)]
const ENotPoster: vector<u8> = b"Only the bounty poster can accept/reject";
#[error(code = 4)]
const ESelfClaim: vector<u8> = b"Cannot claim your own bounty";
#[error(code = 5)]
const ENoPendingClaim: vector<u8> = b"No pending claim to review";
#[error(code = 6)]
const EEmptyDescription: vector<u8> = b"Bounty description cannot be empty";
#[error(code = 7)]
const EZeroReward: vector<u8> = b"Reward quantity must be greater than zero";
#[error(code = 8)]
const EBountyExpired: vector<u8> = b"Bounty has expired";
#[error(code = 9)]
const EEmptyIntel: vector<u8> = b"Submitted intel cannot be empty";

// === Constants ===
const STATUS_OPEN: u8 = 0;
const STATUS_CLAIMED: u8 = 1;
const STATUS_COMPLETED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// === Core Structs ===

/// The bounty board — a shared object holding all bounties.
public struct BountyBoard has key {
    id: UID,
    bounties: vector<Bounty>,
    total_bounties: u64,
    total_completed: u64,
}

/// A single bounty request.
public struct Bounty has store {
    /// Address of the bounty poster
    poster: address,
    /// Human-readable description of what intel is wanted
    description: vector<u8>,
    /// Category tag (e.g. "coordinates", "fleet", "trade")
    category: vector<u8>,
    /// Item type_id offered as reward
    reward_type_id: u64,
    /// Item quantity offered as reward
    reward_quantity: u32,
    /// Expiry timestamp in ms (0 = no expiry)
    expires_at_ms: u64,
    /// Current status
    status: u8,
    /// Address of the claimant (if claimed)
    claimant: address,
    /// Encrypted intel submitted by claimant
    submitted_intel: vector<u8>,
    /// Decryption key submitted by claimant (revealed to poster on accept)
    submitted_key: vector<u8>,
    /// Creation timestamp
    created_at_ms: u64,
}

// === Events ===

/// Emitted when a bounty is posted.
public struct BountyPosted has copy, drop {
    bounty_index: u64,
    poster: address,
    description: vector<u8>,
    category: vector<u8>,
    reward_type_id: u64,
    reward_quantity: u32,
    expires_at_ms: u64,
}

/// Emitted when intel is submitted for a bounty.
public struct BountyClaimed has copy, drop {
    bounty_index: u64,
    claimant: address,
}

/// Emitted when a bounty is accepted — poster gets the decryption key.
public struct BountyAccepted has copy, drop {
    bounty_index: u64,
    poster: address,
    claimant: address,
    decryption_key: vector<u8>,
}

/// Emitted when a claim is rejected.
public struct ClaimRejected has copy, drop {
    bounty_index: u64,
    claimant: address,
}

/// Emitted when a bounty is cancelled.
public struct BountyCancelled has copy, drop {
    bounty_index: u64,
    poster: address,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let board = BountyBoard {
        id: object::new(ctx),
        bounties: vector::empty(),
        total_bounties: 0,
        total_completed: 0,
    };
    transfer::share_object(board);
}

// === Poster Functions ===

/// Post a new bounty requesting specific intel.
/// The poster must have already deposited reward items into the storage unit.
public fun post_bounty<T: key>(
    board: &mut BountyBoard,
    storage_unit: &mut StorageUnit,
    character: &Character,
    player_inventory_owner_cap: &OwnerCap<T>,
    description: vector<u8>,
    category: vector<u8>,
    reward_type_id: u64,
    reward_quantity: u32,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!description.is_empty(), EEmptyDescription);
    assert!(reward_quantity > 0, EZeroReward);

    let poster = ctx.sender();
    let now = clock.timestamp_ms();
    let bounty_index = board.bounties.length();

    // Escrow: withdraw reward items from poster's inventory
    let reward = storage_unit.withdraw_by_owner<T>(
        character,
        player_inventory_owner_cap,
        reward_type_id,
        reward_quantity,
        ctx,
    );

    // Deposit into Dead Drop storage (escrow)
    storage_unit.deposit_item<DeadDropAuth>(
        character,
        reward,
        config::auth(),
        ctx,
    );

    let bounty = Bounty {
        poster,
        description,
        category,
        reward_type_id,
        reward_quantity,
        expires_at_ms,
        status: STATUS_OPEN,
        claimant: @0x0,
        submitted_intel: vector::empty(),
        submitted_key: vector::empty(),
        created_at_ms: now,
    };

    board.bounties.push_back(bounty);
    board.total_bounties = board.total_bounties + 1;

    event::emit(BountyPosted {
        bounty_index,
        poster,
        description,
        category,
        reward_type_id,
        reward_quantity,
        expires_at_ms,
    });
}

/// Accept a submitted claim. Reveals decryption key to poster via event.
public fun accept_claim(
    board: &mut BountyBoard,
    bounty_index: u64,
    ctx: &mut TxContext,
) {
    assert!(bounty_index < board.bounties.length(), EBountyNotFound);

    let bounty = &mut board.bounties[bounty_index];
    assert!(bounty.poster == ctx.sender(), ENotPoster);
    assert!(bounty.status == STATUS_CLAIMED, ENoPendingClaim);

    bounty.status = STATUS_COMPLETED;
    board.total_completed = board.total_completed + 1;

    event::emit(BountyAccepted {
        bounty_index,
        poster: bounty.poster,
        claimant: bounty.claimant,
        decryption_key: bounty.submitted_key,
    });
}

/// Reject a submitted claim, reopening the bounty.
public fun reject_claim(
    board: &mut BountyBoard,
    bounty_index: u64,
    ctx: &mut TxContext,
) {
    assert!(bounty_index < board.bounties.length(), EBountyNotFound);

    let bounty = &mut board.bounties[bounty_index];
    assert!(bounty.poster == ctx.sender(), ENotPoster);
    assert!(bounty.status == STATUS_CLAIMED, ENoPendingClaim);

    let rejected_claimant = bounty.claimant;

    // Reset claim state, reopen bounty
    bounty.status = STATUS_OPEN;
    bounty.claimant = @0x0;
    bounty.submitted_intel = vector::empty();
    bounty.submitted_key = vector::empty();

    event::emit(ClaimRejected {
        bounty_index,
        claimant: rejected_claimant,
    });
}

/// Cancel an open bounty. Only the poster can cancel.
public fun cancel_bounty(
    board: &mut BountyBoard,
    bounty_index: u64,
    ctx: &mut TxContext,
) {
    assert!(bounty_index < board.bounties.length(), EBountyNotFound);

    let bounty = &mut board.bounties[bounty_index];
    assert!(bounty.poster == ctx.sender(), ENotPoster);
    assert!(bounty.status == STATUS_OPEN, EBountyNotOpen);

    bounty.status = STATUS_CANCELLED;

    event::emit(BountyCancelled {
        bounty_index,
        poster: bounty.poster,
    });
}

// === Claimant Functions ===

/// Submit intel to claim a bounty.
public fun submit_claim(
    board: &mut BountyBoard,
    bounty_index: u64,
    encrypted_intel: vector<u8>,
    decryption_key: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(bounty_index < board.bounties.length(), EBountyNotFound);
    assert!(!encrypted_intel.is_empty(), EEmptyIntel);

    let bounty = &mut board.bounties[bounty_index];
    let claimant = ctx.sender();
    let now = clock.timestamp_ms();

    assert!(bounty.status == STATUS_OPEN, EBountyAlreadyClaimed);
    assert!(bounty.poster != claimant, ESelfClaim);
    if (bounty.expires_at_ms > 0) {
        assert!(now <= bounty.expires_at_ms, EBountyExpired);
    };

    bounty.status = STATUS_CLAIMED;
    bounty.claimant = claimant;
    bounty.submitted_intel = encrypted_intel;
    bounty.submitted_key = decryption_key;

    event::emit(BountyClaimed {
        bounty_index,
        claimant,
    });
}

// === View Functions ===

public fun total_bounties(board: &BountyBoard): u64 {
    board.total_bounties
}

public fun total_completed(board: &BountyBoard): u64 {
    board.total_completed
}

public fun bounty_count(board: &BountyBoard): u64 {
    board.bounties.length()
}

public fun bounty_poster(board: &BountyBoard, index: u64): address {
    board.bounties[index].poster
}

public fun bounty_description(board: &BountyBoard, index: u64): vector<u8> {
    board.bounties[index].description
}

public fun bounty_category(board: &BountyBoard, index: u64): vector<u8> {
    board.bounties[index].category
}

public fun bounty_reward_type_id(board: &BountyBoard, index: u64): u64 {
    board.bounties[index].reward_type_id
}

public fun bounty_reward_quantity(board: &BountyBoard, index: u64): u32 {
    board.bounties[index].reward_quantity
}

public fun bounty_status(board: &BountyBoard, index: u64): u8 {
    board.bounties[index].status
}

public fun bounty_claimant(board: &BountyBoard, index: u64): address {
    board.bounties[index].claimant
}

public fun bounty_expires_at(board: &BountyBoard, index: u64): u64 {
    board.bounties[index].expires_at_ms
}
