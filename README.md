# Presto

A testnet first decentralized exchange frontend for Arc and Tempo, with a live Arc normalized hub AMM, wallet aware bridge flows, chain specific liquidity management, and a redesigned app shell.

## Features

- Instant swaps across Tempo and Arc
- Arc and EVM bridge workspace for USDC routes
- Tempo native fee routing and limit order support
- Live Arc hub liquidity for `USDC`, `EURC`, `USDT`, and `WUSDC`
- Chain aware liquidity, portfolio, activity, and docs flows
- Mobile responsive frontend with a redesigned sidebar shell

## Tech Stack

- Frontend: Next.js 16, React 18, Tailwind CSS
- Blockchain: Tempo Testnet, Arc Testnet, Base Sepolia, Hardhat
- Smart Contracts: Solidity 0.8.20, Hardhat
- Wallet: RainbowKit, wagmi, viem
- Charts: Recharts

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

Key environment variables:

```bash
NEXT_PUBLIC_PRODUCTION_MODE=false
NEXT_PUBLIC_HUB_AMM_ADDRESS=0x...
NEXT_PUBLIC_HUB_AMM_ADDRESS_5042002=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
PRIVATE_KEY=your_private_key
```

## Scripts

```bash
# Development
npm run dev

# Build
npm run build
npm start

# Testing
npm test
npm run test:coverage

# Contracts
npm run compile
npm run deploy:local
npm run deploy:hub
npx hardhat run scripts/deploy-arc.ts --network arc
npm run seed:arc
npm run seed:arc:pool -- usdt

# Indexing
npm run indexer
```

## Testing

```bash
npm test
```

Expected output: all tests passing.

## Architecture

```text
app/                Next.js app router pages
src/components/     Shared UI and feature components
src/config/         Chain, token, and contract configuration
src/hooks/          Chain-aware React hooks
src/lib/            RPC, explorer, and contract helpers
contracts/          Solidity contracts
scripts/            Deployment and indexing scripts
data/               Local deployment and analytics snapshots
```

## Docs

Presto ships a built in docs surface at `/docs` with:

- product guidance
- developer references
- privacy policy
- terms of use
- cookie policy

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Tempo Testnet | 42431 | Supported |
| Arc Testnet | 5042002 | Live |
| Base Sepolia | 84532 | Supported |
| Hardhat Local | 31337 | Development |

## License

MIT
