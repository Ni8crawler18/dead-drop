# DEAD/DROP — Underground Intel Market for EVE Frontier

> *In a broken universe, the most valuable resource isn't fuel or minerals — it's information.*

Dead Drop turns Smart Storage Units into an underground intelligence network where scouts sell coordinates, spies trade fleet movements, and bounty hunters bid for target locations. Every transaction is trustless, every provider is rated, and every secret has a price.

**Live Demo:** [deaddrop-intel.vercel.app](https://deaddrop-intel.vercel.app)
**Testnet Package:** `0x01e770318f1fe9a184b976532b784367531d5404aaa8f6f4b19e96da65adbf42`

![Landing Page](images/landing.png)

## How It Works

### Sell Intel
1. Provider writes classified intel (coordinates, fleet routes, trade secrets)
2. Intel is **encrypted client-side** with AES-256-GCM before touching the blockchain
3. Encrypted payload + decryption key stored on-chain via Smart Storage Unit extension
4. Listing appears on the marketplace with title, category, and price

### Buy Intel
1. Buyer browses the marketplace, picks a listing
2. Signs a wallet transaction that pays the listed item price
3. The Move smart contract atomically transfers payment and emits an `IntelPurchased` event
4. The event contains the **AES decryption key** — only visible to the buyer
5. The dApp decrypts and displays the secret intel instantly

### Rate & Reputation
- Buyers rate intel accuracy (positive/negative) within 24 hours
- Provider reputation tracked on-chain — visible to all buyers
- "SUS" badge for providers with low accuracy scores

![Marketplace](images/marketplace.png)

## Features

| Feature | Description |
|---------|-------------|
| **Intel Marketplace** | Browse, filter, and purchase encrypted intelligence |
| **Post Intel** | Encrypt and list your own intel for sale |
| **Bounty Board** | Post bounties requesting specific intel, claim with submissions |
| **Agent Leaderboard** | On-chain reputation scores, sales stats, trust ratings |
| **Auto Onboarding** | One-click demo account setup for new users |
| **AES-256-GCM** | Client-side encryption — keys never exposed until purchase |

![Purchase Success](images/purchase-success.png)

## Architecture

```
┌─────────────┐     AES-256-GCM      ┌──────────────────┐
│  Provider    │ ──── encrypt ──────► │  Sui Blockchain   │
│  (dApp)      │                      │                   │
└─────────────┘                      │  IntelRegistry    │
                                     │  ├─ listings[]    │
┌─────────────┐     purchase_intel   │  ├─ reputations   │
│  Buyer       │ ──── sign tx ─────► │  └─ stats         │
│  (wallet)    │                      │                   │
│              │ ◄── event: key ──── │  BountyBoard      │
│              │     decrypt intel    │  ├─ bounties[]    │
└─────────────┘                      └──────────────────┘
```

### Move Smart Contracts

| Module | Purpose |
|--------|---------|
| `config.move` | Shared config, AdminCap, DeadDropAuth witness for Storage Unit extension |
| `intel_market.move` | Listings, purchases, ratings, reputation (13 functions, 4 events) |
| `bounty_board.move` | Bounty posting, claiming, accept/reject (7 functions, 5 events) |

### Tech Stack

- **Blockchain:** Sui (Move language)
- **Extension Pattern:** Typed witness auth on Smart Storage Units
- **Encryption:** AES-256-GCM (Web Crypto API, client-side)
- **Frontend:** React + Vite + EVE Frontier dApp Kit
- **Wallet:** Slush (Sui wallet)
- **Deployment:** Vercel (frontend) + Sui Testnet (contracts)

![Post Intel](images/intel-post.png)

## Quick Start

### For Users (Demo)
1. Visit [deaddrop-intel.vercel.app](https://deaddrop-intel.vercel.app)
2. Connect your Slush wallet (Sui testnet)
3. Click **"Setup Demo Account"** to auto-provision your character + items
4. Browse intel, post intel, purchase secrets

### For Developers

```bash
# Clone
git clone https://github.com/Ni8crawler18/dead-drop.git
cd dead-drop

# Install
pnpm install

# Deploy contracts (requires Sui CLI + testnet SUI)
cd move-contracts/dead_drop
sui client publish -e testnet --with-unpublished-dependencies

# Configure
cp .env.example .env
# Fill in contract addresses from publish output

# Run dApp
cd dapps
pnpm install
pnpm dev
```

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm dd:configure-market` | Set rating window + max listings |
| `pnpm dd:create-listing` | Encrypt & list intel for sale |
| `pnpm dd:purchase-intel` | Buy intel, receive decryption key |
| `pnpm dd:rate-intel` | Rate purchased intel |
| `pnpm dd:post-bounty` | Post a bounty requesting intel |
| `pnpm dd:submit-claim` | Submit intel for a bounty |
| `pnpm dd:accept-claim` | Accept a bounty claim |

![Agent Leaderboard](images/agent-leaderboard.png)

## Hackathon Categories

- **Creative** — Novel concept: an espionage black market unique to EVE Frontier's universe
- **Weirdest Idea** — An underground intel trading network with encrypted dead drops in space
- **Utility** — Real survival tool: sell coordinates, fleet movements, trade routes
- **Live Frontier Integration** — Deployed on Sui testnet using Smart Storage Unit extensions

## Security Model

- Intel encrypted with **AES-256-GCM** before going on-chain
- Decryption key stored on-chain but **only revealed via event** on purchase
- **Typed witness pattern** (`DeadDropAuth`) restricts storage unit access
- **Self-purchase prevention** — can't buy your own intel
- **Rating window** — buyers must rate within 24 hours
- On-chain reputation is **immutable and transparent**

## License

MIT
