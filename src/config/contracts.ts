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
  // Admin / Emergency
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
  "function tokenDecimals(address token) external view returns (uint8)"
]);

/**
 * Tempo Native DEX ABI - For Tempo chain precompile at 0xdec0...
 * This is the native DEX on Tempo blockchain
 */
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
    ARC_STABLESWAP_ADDRESS: ZERO_ADDRESS,
    WETH_ADDRESS: ZERO_ADDRESS
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

  return {
    ...defaults,
    ...(hubAmmOverride && { HUB_AMM_ADDRESS: hubAmmOverride }),
    ...(arcStableSwapOverride && { ARC_STABLESWAP_ADDRESS: arcStableSwapOverride })
  };
};

// Export for backward compatibility
export const CHAIN_CONTRACTS = DEFAULT_CHAIN_CONTRACTS;
