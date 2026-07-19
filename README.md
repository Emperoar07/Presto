# Presto

Presto is a testnet DEX for Arc with a live normalized hub AMM, Circle powered USDC bridge flows, and full liquidity management.

## Features

- Instant token swaps via a USDC hub-and-spoke AMM on Arc Testnet
- SynRoute smart routing for Arc swaps through Synthra's quote and swap API
- Bidirectional liquidity management with auto-calculated pair amounts
- USDC bridge workspace powered by Circle CCTP for Arc, Ethereum Sepolia, Base Sepolia, Avalanche Fuji, Arbitrum Sepolia, and Optimism Sepolia routes
- Manual bridge destination address support for cross chain sends
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
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | 8 |

Hub AMM (ArcHubAMMNormalized): `0x5794a8284A29493871Fbfa3c4f343D42001424D6`

## LP Rewards

Liquidity providers earn from pool fees and live USYC campaigns. The `USYCRewards` contract keeps the reward program separate from the DEX contracts, so rewards can evolve cleanly as new pairs go live.

| Reward Source | Status |
|---------------|--------|
| Pool fees | Primary LP reward path |
| USYC campaigns | Live per pair rewards |

Current USYC campaign rates:

| Pair | Annual Reward Rate |
|------|--------------------|
| Supported Hub AMM pairs | 0.5% APR |
| cirBTC / USDC | 1% USYC APR |

cirBTC swaps use Synthra Route for BTC market routing on Arc. Its liquidity remains in the Arc Uniswap V2 fork with a 0.3% swap fee. New liquidity joins the 1% USYC campaign automatically. Existing LP holders use Activate 1% Rewards once, then their reward balance appears and remains claimable in My Positions.

The cirBTC campaign pays the same USYC token used by every current reward card. Claiming transfers USYC directly to the connected wallet. Removing activated liquidity checkpoints earned rewards before returning cirBTC and USDC.

**USYCRewards contract:** `0x3454fB11Ead7a10806434daE0A7EfFd289ABb908`
Funded with **4,000,000 USYC**.

**cirBTC liquidity rewards contract:** `0x735C744F459f9E19E5061dA46FAe417b87Cb22B2`
Funded with **100,000 USYC**.

Set in Vercel after deploying:
```
NEXT_PUBLIC_USYC_REWARDS_ADDRESS=0x3454fB11Ead7a10806434daE0A7EfFd289ABb908
```

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
NEXT_PUBLIC_USYC_REWARDS_ADDRESS=0x3454fB11Ead7a10806434daE0A7EfFd289ABb908
NEXT_PUBLIC_CIRBTC_REWARDS_ADDRESS=0x735C744F459f9E19E5061dA46FAe417b87Cb22B2
NEXT_PUBLIC_PRESTO_MARKETS_URL=https://presto-markets.vercel.app
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
SYNTHRA_API_KEY=your_synthra_api_key
NEXT_PUBLIC_SYNROUTE_ENABLED=true
NEXT_PUBLIC_SYNROUTE_APPROVAL_MODE=erc20
NEXT_PUBLIC_BRIDGE_DEBUG=false
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
npx hardhat run scripts/deploy-usyc-rewards.ts --network arc   # deploy + fund 2M USYC
npx hardhat run scripts/deploy-cirbtc-liquidity-rewards.ts --network arc
npx hardhat run scripts/fund-usyc-rewards.ts --network arc     # top up existing contract
npx hardhat run scripts/seed-arc-liquidity.ts --network arc
npx hardhat run scripts/seed-usyc-liquidity.ts --network arc
ARC_SEED_TOKEN=cirbtc ARC_SEED_AMOUNT=0.01 npx hardhat run scripts/seed-arc-normalized-pool.ts --network arc

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
app/api/synroute/     Server-side proxy for Synthra SynRoute quote and swap calls
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

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Arc Testnet | 5042002 | Live |
| Tempo Testnet | 42431 | Supported |
| Ethereum Sepolia | 11155111 | Bridge origin |
| Base Sepolia | 84532 | Bridge origin |
| Avalanche Fuji | 43113 | Bridge origin |
| Arbitrum Sepolia | 421614 | Bridge origin |
| Optimism Sepolia | 11155420 | Bridge origin |
| Hardhat Local | 31337 | Development |

## SynRoute

Set `SYNTHRA_API_KEY` for SynRoute on Arc Testnet swaps. The frontend calls local API routes under `/api/synroute/*`, and those routes forward validated requests to `https://trading-api.synthra.org` with the `x-api-key` header. Keep this key server-side; do not add a public `NEXT_PUBLIC_SYNTHRA_API_KEY`.

`NEXT_PUBLIC_SYNROUTE_APPROVAL_MODE` accepts `erc20` or `permit2`. The default is `erc20` to preserve exact-amount approval behavior.

## Docs

Presto ships a built-in docs surface at `/docs` with product guidance, developer references, privacy policy, terms of use, and cookie policy.

## License

MIT
