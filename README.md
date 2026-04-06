# Presto

Presto is a testnet DEX for Arc and Tempo with a live normalized hub AMM, USDC bridge flows, on-chain analytics, and full liquidity management.

## Features

- Instant token swaps via a USDC hub-and-spoke AMM on Arc Testnet
- Bidirectional liquidity management with auto-calculated pair amounts
- Real-time analytics tracking all-time volume (swaps + liquidity + bridge), trades, and unique traders
- USDC bridge workspace powered by Circle CCTP (Ethereum Sepolia to Arc)
- Manual bridge destination address support
- Portfolio dashboard with LP position tracking
- Mobile responsive sidebar shell with chain-aware navigation

## Live Assets on Arc Testnet

| Token | Address | Decimals |
|-------|---------|----------|
| USDC (hub) | `0x3600000000000000000000000000000000000000` | 6 |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |
| USDT | `0x175CdB1D338945f0D851A741ccF787D343E57952` | 18 |
| WUSDC | `0x911b4000D3422F482F4062a913885f7b035382Df` | 18 |
| USYC | `0x825Ae482558415310C71B7E03d2BbBe409345903` | 6 |

Hub AMM (ArcHubAMMNormalized): `0x5794a8284A29493871Fbfa3c4f343D42001424D6`

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Blockchain**: Arc Testnet (5042002), Tempo Testnet (42431), Base Sepolia, Hardhat
- **Smart Contracts**: Solidity 0.8.20, Hardhat, OpenZeppelin
- **Wallet**: RainbowKit, wagmi, viem
- **Bridge**: Circle CCTP via Wormhole SDK
- **Data**: React Query with server-side caching and parallel log scanning

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/Emperoar07/Presto.git
cd Presto
npm install
cp .env.example .env
npm run dev
```

### Environment Variables

```bash
NEXT_PUBLIC_PRODUCTION_MODE=false
NEXT_PUBLIC_HUB_AMM_ADDRESS_5042002=0x5794a8284A29493871Fbfa3c4f343D42001424D6
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
PRIVATE_KEY=your_deployer_private_key
```

## Scripts

```bash
# Development
npm run dev

# Build
npm run build
npm start

# Contracts
npm run compile
npx hardhat run scripts/deploy-arc.ts --network arc
npx hardhat run scripts/seed-arc-liquidity.ts --network arc
npx hardhat run scripts/seed-usyc-liquidity.ts --network arc

# Testing
npm test
```

## Architecture

```text
app/                  Next.js app router pages and API routes
app/api/dex-stats/    All-time volume, trades, traders (on-chain log scanning)
app/api/pool-stats/   Per-pool liquidity and volume stats
src/components/       Shared UI and feature components
src/config/           Chain, token, and contract configuration
src/hooks/            Chain-aware React hooks and API queries
src/lib/              RPC, explorer, price impact, and contract helpers
contracts/            Solidity contracts (HubAMM, TestUSYC, etc.)
scripts/              Deployment, seeding, and utility scripts
data/                 Local deployment snapshots
```

## Analytics

The analytics page tracks protocol-wide stats by scanning on-chain events from block 0:

- **All-time Volume**: Sum of USDC flowing through swaps and liquidity deposits
- **All-time Trades**: Count of all Swap events across every pool
- **Unique Traders**: Distinct wallets from swaps and liquidity adds
- **Volume by Pool**: Per-pool volume bar chart
- **Pool Activity**: Live table with liquidity, volume, and status per pool

Stats are served from `/api/dex-stats` with 60s server cache, parallel chunk scanning (6 concurrent), and stale-while-revalidate headers.

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Arc Testnet | 5042002 | Live |
| Tempo Testnet | 42431 | Supported |
| Base Sepolia | 84532 | Bridge origin |
| Hardhat Local | 31337 | Development |

## Docs

Presto ships a built-in docs surface at `/docs` with product guidance, developer references, privacy policy, terms of use, and cookie policy.

## License

MIT
