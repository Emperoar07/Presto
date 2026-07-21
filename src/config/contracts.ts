import { hardhat } from 'wagmi/chains';
import { parseAbi } from 'viem';

const DEFAULT_CHAIN_ID = 5042002;

// ============================================================================
// ABIs - Contract interface definitions (do not modify during deployment)
// ============================================================================

export const ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)"
];

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint amount) returns (bool)",
  "function mint(address to, uint amount) external"
];

export const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "function allPairs(uint) external view returns (address pair)",
  "function allPairsLength() external view returns (uint)",
  "function feeTo() external view returns (address)",
  "function feeToSetter() external view returns (address)",
  "function setFeeTo(address) external"
];

export const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

/** Uniswap V2 router swap entrypoint used for client-side execution. */
export const UNISWAP_V2_ROUTER_SWAP_ABI = parseAbi([
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external returns (uint[] memory amounts)",
]);

/** Uniswap V2 router add/remove liquidity entrypoints (fork pools). */
export const UNISWAP_V2_ROUTER_LIQUIDITY_ABI = parseAbi([
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)",
]);

/** Uniswap V2 factory + pair reads for fork pools. */
export const UNISWAP_V2_FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
]);

export const UNISWAP_V2_PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function name() external view returns (string)",
  "function nonces(address owner) external view returns (uint256)",
  "function DOMAIN_SEPARATOR() external view returns (bytes32)",
]);

export const CIRBTC_LIQUIDITY_REWARDS_ABI = parseAbi([
  "function usyc() external view returns (address)",
  "function cirBtc() external view returns (address)",
  "function usdc() external view returns (address)",
  "function pair() external view returns (address)",
  "function router() external view returns (address)",
  "function rewardRateBps() external view returns (uint256)",
  "function principalPerLpX18() external view returns (uint256)",
  "function stakedLp(address provider) external view returns (uint256)",
  "function principalUsdc(address provider) external view returns (uint256)",
  "function pendingRewards(address provider) external view returns (uint256)",
  "function lastCheckpoint(address provider) external view returns (uint256)",
  "function claimableOf(address provider) external view returns (uint256)",
  "function contractBalance() external view returns (uint256)",
  "function activate(uint256 lpAmount) external",
  "function activateWithPermit(uint256 lpAmount, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external",
  "function addLiquidity(uint256 cirBtcDesired, uint256 usdcDesired, uint256 cirBtcMin, uint256 usdcMin, uint256 deadline) external returns (uint256 cirBtcUsed, uint256 usdcUsed, uint256 lpMinted)",
  "function removeLiquidity(uint256 lpAmount, uint256 cirBtcMin, uint256 usdcMin, uint256 deadline) external returns (uint256 cirBtcOut, uint256 usdcOut)",
  "function claim() external returns (uint256 amount)",
  "event PositionActivated(address indexed provider, uint256 lpAmount, uint256 principalAdded)",
  "event LiquidityAdded(address indexed provider, uint256 cirBtcAmount, uint256 usdcAmount, uint256 lpAmount, uint256 principalAdded)",
  "event LiquidityRemoved(address indexed provider, uint256 lpAmount, uint256 cirBtcAmount, uint256 usdcAmount, uint256 principalRemoved)",
  "event RewardClaimed(address indexed provider, uint256 amount)",
]);

export const STABLE_VAULT_ABI = [
  "function swap(address tokenIn, address tokenOut, uint256 amountIn) external",
  "function withdraw(address token, uint256 amount) external",
  "function getBalance(address token) external view returns (uint256)"
];

/**
 * TempoHubAMM ABI - Hub-and-spoke AMM with pathUSD as central token
 * All functions include deadline parameter for MEV protection
 */
export const HUB_AMM_ABI = parseAbi([
  // Liquidity Management
  "function addLiquidity(address userToken, address validatorToken, uint256 amount, uint256 deadline) external returns (uint256 mintedShares)",
  "function removeLiquidity(address userToken, address validatorToken, uint256 shareAmount, uint256 minUserOut, uint256 minPathOut, uint256 deadline) external returns (uint256 userOut, uint256 pathOut)",
  // Swapping
  "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)",
  "function getQuote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut)",
  // State Queries
  "function tokenReserves(address token) external view returns (uint256)",
  "function pathReserves(address token) external view returns (uint256)",
  "function totalShares(address token) external view returns (uint256)",
  "function shares(address token, address provider) external view returns (uint256)",
  "function liquidityOf(address userToken, address provider) external view returns (uint256)",
  "function pathUSD() external view returns (address)",
  "function pause() external",
  "function unpause() external",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)"
]);

export const ARC_STABLESWAP_ABI = parseAbi([
  "function addLiquidity(uint256[] amounts, uint256 minLpOut, uint256 deadline) external returns (uint256 lpOut)",
  "function removeLiquidity(uint256 lpAmount, uint256[] minAmountsOut, uint256 deadline) external returns (uint256[] memory amountsOut)",
  "function removeLiquidityOneToken(uint256 lpAmount, address tokenOut, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)",
  "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)",
  "function getQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut)",
  "function getVirtualPrice() external view returns (uint256)",
  "function getSupportedTokens() external view returns (address[] memory)",
  "function getTokenCount() external view returns (uint256)",
  "function isSupportedToken(address token) external view returns (bool)",
  "function tokenDecimals(address token) external view returns (uint8)",
  "function reserves(address token) external view returns (uint256)",
  "function lpBalanceOf(address provider) external view returns (uint256)",
  "function totalLpSupply() external view returns (uint256)"
]);

export const TEMPO_DEX_ABI = parseAbi([
  // Swapping
  "function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external returns (uint128 amountOut)",
  "function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) external view returns (uint128)",
  // Liquidity (Fee AMM)
  "function addLiquidity(address userToken, address validatorToken, uint128 validatorTokenAmount) external",
  "function removeLiquidity(address userToken, address validatorToken, uint256 liquidityAmount) external",
  "function getPool(address userToken, address validatorToken) external view returns (uint256 reserveUserToken, uint256 reserveValidatorToken)",
  "function liquidityOf(address userToken, address validatorToken, address provider) external view returns (uint256)"
]);

// Tempo DEX precompile address
export const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000' as const;

// Tempo Fee Manager precompile address (for liquidity)
export const TEMPO_FEE_MANAGER_ADDRESS = '0xfeec000000000000000000000000000000000000' as const;

/**
 * Check if chain is Tempo native (uses precompile DEX)
 */
export const isTempoNativeChain = (chainId?: number): boolean => chainId === 42431;

/**
 * Check if chain is Arc network
 */
export const isArcChain = (chainId?: number): boolean => chainId === 5042002;

/**
 * Get the DEX address for a specific chain
 */
export const getDexAddress = (chainId?: number): `0x${string}` => {
  if (isTempoNativeChain(chainId)) {
    return TEMPO_DEX_ADDRESS;
  }
  return getContractAddresses(chainId).HUB_AMM_ADDRESS;
};

/**
 * Get the Fee Manager / Liquidity address for a specific chain
 */
export const getFeeManagerAddress = (chainId?: number): `0x${string}` => {
  if (isTempoNativeChain(chainId)) {
    return TEMPO_FEE_MANAGER_ADDRESS;
  }
  return getContractAddresses(chainId).HUB_AMM_ADDRESS;
};

// ============================================================================
// Contract Addresses - Chain-specific deployment addresses
// Override with environment variables: NEXT_PUBLIC_HUB_AMM_ADDRESS_<CHAIN_ID>
// ============================================================================

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type ContractAddresses = {
  ROUTER_ADDRESS: `0x${string}`;
  FACTORY_ADDRESS: `0x${string}`;
  STABLE_VAULT_ADDRESS: `0x${string}`;
  HUB_AMM_ADDRESS: `0x${string}`;
  ARC_STABLESWAP_ADDRESS: `0x${string}`;
  WETH_ADDRESS: `0x${string}`;
  UNISWAP_UNIVERSAL_ROUTER?: `0x${string}`;
  // Uniswap V2 fork used as an additional aggregator route
  UNISWAP_V2_FACTORY?: `0x${string}`;
  UNISWAP_V2_ROUTER?: `0x${string}`;
};

// Default contract addresses per chain
const DEFAULT_CHAIN_CONTRACTS: Record<number, ContractAddresses> = {
  [hardhat.id]: {
    ROUTER_ADDRESS: ZERO_ADDRESS,
    FACTORY_ADDRESS: ZERO_ADDRESS,
    STABLE_VAULT_ADDRESS: "0x0816AF96DE0f19CdcC83F717E5f65aeE1373A54A",
    HUB_AMM_ADDRESS: "0x0816AF96DE0f19CdcC83F717E5f65aeE1373A54A",
    ARC_STABLESWAP_ADDRESS: ZERO_ADDRESS,
    WETH_ADDRESS: ZERO_ADDRESS
  },
  [84532]: { // Base Sepolia
    ROUTER_ADDRESS: ZERO_ADDRESS,
    FACTORY_ADDRESS: ZERO_ADDRESS,
    STABLE_VAULT_ADDRESS: ZERO_ADDRESS,
    HUB_AMM_ADDRESS: "0x0816AF96DE0f19CdcC83F717E5f65aeE1373A54A",
    ARC_STABLESWAP_ADDRESS: ZERO_ADDRESS,
    WETH_ADDRESS: "0x4200000000000000000000000000000000000006",
    UNISWAP_UNIVERSAL_ROUTER: "0x492E6456D9528771018DeB9E87ef7750EF184104"
  },
  [42431]: { // Tempo Testnet (Moderato)
    ROUTER_ADDRESS: ZERO_ADDRESS,
    FACTORY_ADDRESS: ZERO_ADDRESS,
    STABLE_VAULT_ADDRESS: ZERO_ADDRESS,
    HUB_AMM_ADDRESS: "0x0816AF96DE0f19CdcC83F717E5f65aeE1373A54A",
    ARC_STABLESWAP_ADDRESS: ZERO_ADDRESS,
    WETH_ADDRESS: ZERO_ADDRESS
  },
  [5042002]: { // Arc Testnet — HUB_AMM_ADDRESS set after deployment
    ROUTER_ADDRESS: ZERO_ADDRESS,
    FACTORY_ADDRESS: ZERO_ADDRESS,
    STABLE_VAULT_ADDRESS: ZERO_ADDRESS,
    HUB_AMM_ADDRESS: "0x5794a8284A29493871Fbfa3c4f343D42001424D6",
    ARC_STABLESWAP_ADDRESS: "0xcA61d269A05526270c3eB905A4a24283c6630134", // deploy-stableswap.ts (D-accounting fix)
    WETH_ADDRESS: "0x911b4000D3422F482F4062a913885f7b035382Df", // WUSDC (wrapped native)
    // Uniswap V2 fork deployed via scripts/deploy-uniswap-arc.ts
    UNISWAP_V2_FACTORY: "0xd70dd32d5Ee254F92ed1B259B6a8c22dA5CCb754",
    UNISWAP_V2_ROUTER: "0x2c820034B1ccb6739d7F8E25c572Cb6Bb5ed7211"
  }
};

// Environment variable overrides
const getEnvAddress = (key: string): `0x${string}` | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) {
      return value as `0x${string}`;
    }
  }
  return undefined;
};

/**
 * Get contract addresses for a specific chain
 * Supports environment variable overrides:
 * - NEXT_PUBLIC_HUB_AMM_ADDRESS (global override)
 * - NEXT_PUBLIC_HUB_AMM_ADDRESS_<CHAIN_ID> (chain-specific override)
 * - NEXT_PUBLIC_ARC_STABLESWAP_ADDRESS (global override)
 * - NEXT_PUBLIC_ARC_STABLESWAP_ADDRESS_<CHAIN_ID> (chain-specific override)
 */
export const getContractAddresses = (chainId?: number): ContractAddresses => {
  const id = chainId || DEFAULT_CHAIN_ID;
  const defaults = DEFAULT_CHAIN_CONTRACTS[id] || DEFAULT_CHAIN_CONTRACTS[DEFAULT_CHAIN_ID];

  // Check for environment variable overrides
  const hubAmmOverride = getEnvAddress(`NEXT_PUBLIC_HUB_AMM_ADDRESS_${id}`)
    || getEnvAddress('NEXT_PUBLIC_HUB_AMM_ADDRESS');
  const arcStableSwapOverride = getEnvAddress(`NEXT_PUBLIC_ARC_STABLESWAP_ADDRESS_${id}`)
    || getEnvAddress('NEXT_PUBLIC_ARC_STABLESWAP_ADDRESS');
  const uniV2FactoryOverride = getEnvAddress(`NEXT_PUBLIC_UNISWAP_V2_FACTORY_${id}`)
    || getEnvAddress('NEXT_PUBLIC_UNISWAP_V2_FACTORY');
  const uniV2RouterOverride = getEnvAddress(`NEXT_PUBLIC_UNISWAP_V2_ROUTER_${id}`)
    || getEnvAddress('NEXT_PUBLIC_UNISWAP_V2_ROUTER');

  return {
    ...defaults,
    ...(hubAmmOverride && { HUB_AMM_ADDRESS: hubAmmOverride }),
    ...(arcStableSwapOverride && { ARC_STABLESWAP_ADDRESS: arcStableSwapOverride }),
    ...(uniV2FactoryOverride && { UNISWAP_V2_FACTORY: uniV2FactoryOverride }),
    ...(uniV2RouterOverride && { UNISWAP_V2_ROUTER: uniV2RouterOverride })
  };
};

/**
 * Uniswap V2 fork addresses for a chain, if configured.
 * Returns null when no fork is deployed for the chain.
 */
export const getUniswapV2Addresses = (
  chainId?: number
): { factory: `0x${string}`; router: `0x${string}` } | null => {
  const { UNISWAP_V2_FACTORY, UNISWAP_V2_ROUTER } = getContractAddresses(chainId);
  if (
    UNISWAP_V2_FACTORY && UNISWAP_V2_FACTORY !== ZERO_ADDRESS &&
    UNISWAP_V2_ROUTER && UNISWAP_V2_ROUTER !== ZERO_ADDRESS
  ) {
    return { factory: UNISWAP_V2_FACTORY, router: UNISWAP_V2_ROUTER };
  }
  return null;
};

// Export for backward compatibility
export const CHAIN_CONTRACTS = DEFAULT_CHAIN_CONTRACTS;

// ============================================================================
// USYC Rewards Contract
// ============================================================================

  export const USYC_REWARDS_ABI = parseAbi([
    "function claimableOf(address user, address token) external view returns (uint256)",
    "function pendingRewards(address user, address token) external view returns (uint256)",
    "function lastSnapshot(address user, address token) external view returns (uint256)",
    "function rewardRate(address token) external view returns (uint256)",
    "function rewardRateConfigured(address token) external view returns (bool)",
    "function poolEnabled(address token) external view returns (bool)",
    "function contractBalance() external view returns (uint256)",
    "function snapshot(address user, address token) external",
    "function claim(address token) external",
    "function setRewardRate(address token, uint256 rateBps) external",
    "function setPoolEnabled(address token, bool enabled) external",
    "function ownerSnapshot(address user, address token, uint256 firstDepositTimestamp) external",
    "function ownerSnapshotBatch(address[] users, address[] tokens, uint256[] timestamps) external",
    "event RewardClaimed(address indexed user, address indexed token, uint256 amount)",
    "event RewardAccrued(address indexed user, address indexed token, uint256 amount)",
    "event RewardPoolEnabled(address indexed token, bool enabled)",
    "event OwnerSnapshotSet(address indexed user, address indexed token, uint256 timestamp)",
    "event Initialized(address indexed owner, address indexed usyc, address indexed hubAmm)",
  ]);

export const DEFAULT_USYC_REWARDS_ADDRESS = '0xc4F909a6BACF1485fa67cB9d69CDe0Bd3Ce1FA44' as const;

export const USYC_REWARDS_ADDRESS: `0x${string}` = (
  process.env.NEXT_PUBLIC_USYC_REWARDS_ADDRESS ?? DEFAULT_USYC_REWARDS_ADDRESS
) as `0x${string}`;

export const DEFAULT_CIRBTC_REWARDS_ADDRESS = '0x7f404Eb83801b1E8177802EAaaC6f5981C88F9A1' as const;

export const CIRBTC_REWARDS_ADDRESS: `0x${string}` = (
  process.env.NEXT_PUBLIC_CIRBTC_REWARDS_ADDRESS ?? DEFAULT_CIRBTC_REWARDS_ADDRESS
) as `0x${string}`;
