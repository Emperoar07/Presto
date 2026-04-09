# Presto

Presto is a testnet DEX for Arc and Tempo with a live normalized hub AMM, USDC bridge flows, on-chain analytics, and full liquidity management.

## Features

- Instant token swaps via a USDC hub-and-spoke AMM on Arc Testnet
- Bidirectional liquidity management with auto-calculated pair amounts
- Real-time analytics tracking all time volume, trades, and unique traders from on-chain events
- USDC bridge workspace powered by Circle CCTP for Arc, Ethereum Sepolia, Base Sepolia, and Solana Devnet routes
- Manual bridge destination address support where the route allows it
- Send any ERC20 token on Arc Testnet, including custom tokens by pasting a contract address
- Deploy tokens/memecoins, NFT collections, and smart contracts directly from the browser
- Token deployment with seed liquidity on Hub AMM and owner mint capability
- NFT deployment with metadata, configurable mint price, and shareable public mint pages (`/mint/{address}`)
- Generic contract deployment from ABI + bytecode with built-in templates
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

- **Frontend**: Next.js 16.1.1, React 18, Tailwind CSS
- **Blockchain**: Arc Testnet (5042002), Tempo Testnet (42431), Base Sepolia, Hardhat
- **Smart Contracts**: Solidity 0.8.20, Hardhat, OpenZeppelin
- **Wallet**: RainbowKit, wagmi, viem
- **Bridge**: Circle CCTP via Circle Bridge Kit
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
app/deploy/           Deploy hub: token, NFT, and contract deployment pages
app/deploy/token/     ERC20 token/memecoin deployment with seed liquidity
app/deploy/nft/       ERC721 NFT deployment with mint page generation
app/deploy/contract/  Generic smart contract deployment from ABI + bytecode
app/mint/[address]/   Public NFT mint page (standalone, shareable link)
app/send/             Send any ERC20 token, including custom tokens by address
src/components/       Shared UI and feature components
src/config/           Chain, token, and contract configuration
src/hooks/            Chain-aware React hooks and API queries
src/lib/              RPC, explorer, price impact, deploy utils, and contract helpers
contracts/            Solidity contracts (HubAMM, DeployableToken, DeployableNFT, etc.)
scripts/              Deployment, seeding, and utility scripts
data/                 Local deployment snapshots
```

## Deploy

The deploy hub at `/deploy` lets users create and manage on-chain assets directly from the browser:

### Tokens / Memecoins (`/deploy/token`)
- Deploy an ERC20 token with custom name, symbol, decimals, and initial supply
- Seed initial liquidity on the Hub AMM paired with USDC
- Mint additional tokens to any address (owner only)
- Manage existing deployments at `/deploy/token/{address}`

### NFT Collections (`/deploy/nft`)
- Deploy an ERC721 NFT with collection name, symbol, max supply, mint price, and base URI
- Get a shareable public mint page at `/mint/{address}` with progress bar and wallet connect
- Owner mint (free), update base URI, and withdraw mint revenue
- Manage existing collections at `/deploy/nft/{address}`

### Smart Contracts (`/deploy/contract`)
- Deploy any smart contract from ABI (JSON) and bytecode (hex)
- Load built-in templates (ERC20 Token, NFT Collection) for quick deployment
- Constructor arguments passed as a JSON array

All deployments are tracked in localStorage per wallet and shown on the deploy landing page under "My Deployments". Deploy activities appear in the Activity page under the "Deploy" tab.

**Contracts**: `contracts/DeployableToken.sol` (ERC20 + Ownable + mint + burn) and `contracts/DeployableNFT.sol` (ERC721 + URIStorage + Ownable + public mint + owner mint).

## Analytics

The analytics page tracks protocol-wide stats by scanning on-chain events from block 0:

- **All-time Volume**: Total protocol volume since launch
- **All-time Trades**: Count of all Swap events across every pool
- **Unique Traders**: Distinct wallets from swap events
- **Pool Activity**: Live table with liquidity, volume, and status per pool

Stats are served from `/api/dex-stats` with 60s server cache, parallel chunk scanning (6 concurrent), and stale-while-revalidate headers.

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Arc Testnet | 5042002 | Live |
| Tempo Testnet | 42431 | Supported |
| Ethereum Sepolia | 11155111 | Bridge origin |
| Base Sepolia | 84532 | Bridge origin |
| Solana Devnet | — | Bridge origin |
| Hardhat Local | 31337 | Development |

## Docs

Presto ships a built-in docs surface at `/docs` with product guidance, developer references, privacy policy, terms of use, and cookie policy.

## License

MIT
