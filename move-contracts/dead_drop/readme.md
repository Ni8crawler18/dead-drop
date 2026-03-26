# Dead Drop - Anonymous Intel Market

> In EVE Frontier's broken universe, the most valuable resource isn't fuel or minerals - it's information.

Dead Drop turns Smart Storage Units into an underground intelligence network where scouts sell coordinates, spies trade fleet movements, and bounty hunters bid for target locations. Every transaction is trustless, every provider is rated, and every secret has a price.

## Architecture

### Move Contracts

- **`config.move`** — Shared `DeadDropConfig` + `AdminCap` + `DeadDropAuth` witness for storage unit extension authorization
- **`intel_market.move`** — Core intel marketplace: listings, purchases, ratings, reputation tracking
- **`bounty_board.move`** — Request-side market: post bounties for specific intel, claim with submissions

### How It Works

**Intel Market (Sell Side)**
1. Provider encrypts intel client-side (AES-256-GCM)
2. Provider creates listing: encrypted payload + decryption key + item price
3. Buyer pays items from their storage unit inventory
4. Contract emits `IntelPurchased` event containing the decryption key
5. Buyer decrypts intel using key from event
6. Buyer rates intel accuracy (affects provider reputation)

**Bounty Board (Buy Side)**
1. Poster deposits reward items (escrowed) + describes desired intel
2. Claimant submits encrypted intel + decryption key
3. Poster reviews and accepts/rejects
4. On accept: `BountyAccepted` event reveals key to poster

### Key Design Decisions

- **Client-side encryption**: Intel encrypted with AES-256-GCM before going on-chain. Key stored on-chain but only revealed via event on purchase.
- **Typed witness pattern**: `DeadDropAuth` registered on storage units via `authorize_extension`, matching the world contract extension model.
- **Append-only listings**: Listings stored in a vector for simple indexing. Status field tracks lifecycle.
- **On-chain reputation**: Buyers rate intel accuracy. Provider reputation visible to all.

## Deployment

```bash
# 1. Publish the Move package
cd move-contracts/dead_drop
sui client publish --build-env testnet

# 2. Set env vars from publish output
# DEAD_DROP_PACKAGE_ID=0x...
# DEAD_DROP_CONFIG_ID=0x...    (DeadDropConfig shared object)
# DEAD_DROP_REGISTRY_ID=0x...  (IntelRegistry shared object)
# DEAD_DROP_BOUNTY_BOARD_ID=0x... (BountyBoard shared object)

# 3. Configure market rules
pnpm dd:configure-market

# 4. Authorize extension on a storage unit
# (use authorise-storage-unit-extension pattern from smart_gate_extension)
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dd:configure-market` | Set rating window + max listings |
| `pnpm dd:create-listing` | Encrypt & list intel for sale |
| `pnpm dd:purchase-intel` | Buy intel, receive decryption key |
| `pnpm dd:rate-intel` | Rate purchased intel |
| `pnpm dd:cancel-listing` | Cancel an active listing |
| `pnpm dd:post-bounty` | Post a bounty requesting intel |
| `pnpm dd:submit-claim` | Submit intel for a bounty |
| `pnpm dd:accept-claim` | Accept a bounty claim |
| `pnpm dd:reject-claim` | Reject a bounty claim |
