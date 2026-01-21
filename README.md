# Tempo Mini DEX (PrestoDEX)

A high-performance decentralized exchange built on the Tempo blockchain featuring a Hub-and-Spoke AMM model with pathUSD as the central routing token.

## Features

- **Instant Swaps** - Swap tokens with 0.3% fee using automated market maker
- **Hub-and-Spoke AMM** - All tokens pair with pathUSD for efficient routing
- **Liquidity Provision** - Add/remove liquidity and earn trading fees
- **Multi-hop Routing** - Automatic routing through pathUSD for token-to-token swaps
- **Real-time Analytics** - Track pool metrics, volume, and TVL
- **Mobile Responsive** - Full mobile support with hamburger navigation
- **GPU-Optimized UI** - Smooth animations with hardware acceleration

## Tech Stack

- **Frontend**: Next.js 16, React 18, TailwindCSS
- **Blockchain**: Tempo Network (Chain ID: 42431)
- **Smart Contracts**: Solidity 0.8.20, Hardhat
- **Wallet**: RainbowKit, wagmi, viem
- **Charts**: Recharts (lazy-loaded)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Emperoar07/tempo-mini-dapp.git
cd tempo-mini-dapp

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Run development server
npm run dev
```

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Production mode (shows "Live" badge instead of "Testnet")
NEXT_PUBLIC_PRODUCTION_MODE=false

# Contract address overrides
NEXT_PUBLIC_HUB_AMM_ADDRESS=0x...

# WalletConnect Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Private key for deployment (never commit!)
PRIVATE_KEY=your_private_key
```

## Scripts

```bash
# Development
npm run dev          # Start development server

# Building
npm run build        # Build for production
npm start            # Start production server

# Testing
npm test             # Run all tests (74 tests)
npm run test:coverage # Run tests with coverage

# Smart Contracts
npm run compile      # Compile Solidity contracts
npm run deploy:local # Deploy to local Hardhat network
npm run deploy:hub   # Deploy Hub AMM to local network
```

## Testing

The project includes comprehensive test coverage:

- **44 Unit Tests** - Core AMM functionality
- **30 Security Tests** - Reentrancy, access control, slippage protection

```bash
# Run all tests
npm test

# Expected output: 74 passing
```

## Smart Contracts

### TempoHubAMM

The main AMM contract implementing:

- **Hub-and-Spoke Model**: All tokens pair with pathUSD
- **Constant Product Formula**: x * y = k with 0.3% fee
- **First LP Protection**: Minimum liquidity locked to prevent inflation attacks
- **Pausable**: Emergency pause functionality for owner
- **Slippage Protection**: minAmountOut parameter on all swaps
- **Deadline Protection**: Transactions expire after deadline

### Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Ownable**: Access control for admin functions
- **Pausable**: Emergency stop mechanism
- **Token Whitelist** (StableVault): Only approved tokens can be swapped
- **Exact Approvals**: Uses exact amounts instead of unlimited approvals

## Architecture

```
src/
├── app/                    # Next.js app router pages
│   ├── swap/              # Swap interface
│   ├── liquidity/         # Liquidity management
│   └── analytics/         # Analytics dashboard
├── components/
│   ├── common/            # Shared components (Header, Background, Skeleton)
│   ├── swap/              # Swap-specific components
│   ├── liquidity/         # Liquidity components
│   └── analytics/         # Analytics components
├── lib/
│   ├── tempo.ts           # Tempo blockchain hooks
│   ├── tempoClient.ts     # Contract interactions
│   └── orderbook.ts       # Orderbook utilities
└── config/
    └── contracts.ts       # Contract addresses per chain

contracts/
├── TempoHubAMM.sol        # Main AMM contract
├── StableVault.sol        # Vault with token whitelist
└── mocks/                 # Test tokens
```

## Performance Optimizations

- **GPU-Accelerated Background**: Uses `transform: translateZ(0)` and radial gradients
- **Dynamic Imports**: Heavy components (Recharts) loaded on demand
- **Memoized Components**: React.memo for Header and navigation
- **Loading Skeletons**: Smooth loading states for better UX
- **Reduced Motion Support**: Respects user preferences

## Production Deployment

1. Set environment variables:
   ```bash
   NEXT_PUBLIC_PRODUCTION_MODE=true
   NEXT_PUBLIC_HUB_AMM_ADDRESS=<deployed_contract>
   ```

2. Build and deploy:
   ```bash
   npm run build
   npm start
   ```

3. The header badge will show "Live" with a green pulse indicator.

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Tempo Moderato | 42431 | Supported |
| Base Sepolia | 84532 | Supported |
| Hardhat Local | 31337 | Development |

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

---

Built with [Tempo](https://tempo.xyz) | Powered by [Claude Code](https://claude.ai/claude-code)
