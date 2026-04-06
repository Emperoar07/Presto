import { formatUnits, parseAbi, type WalletClient, type PublicClient, maxUint256 } from 'viem';
import { writeContractWithRetry } from '@/lib/txRetry';
import { readContractWithFallback } from '@/lib/rpc';
import { getContractAddresses, getDexAddress, getFeeManagerAddress, ZERO_ADDRESS } from '@/config/contracts';

const TEMPO_PATH_USD = '0x20c0000000000000000000000000000000000000';

export const getDexAddressForChain = (chainId?: number) => getDexAddress(chainId);

type ChainAware = { chain?: { id?: number } } | null | undefined;

const resolveChainId = (
  explicit?: number,
  client?: ChainAware,
  publicClient?: ChainAware
) => explicit ?? client?.chain?.id ?? publicClient?.chain?.id;

// STRICT uint128 Types for Tempo Native DEX
const DEX_ABI = parseAbi([
  'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external payable returns (uint128 amountOut)',
  'function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) external view returns (uint128)',
  'function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)',
  'function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)',
  'function addLiquidity(address userToken, address validatorToken, uint128 amount) external',
  'function getPool(address userToken, address validatorToken) external view returns (uint256 reserveUserToken, uint256 reserveValidatorToken)',
  'function withdraw(address token, uint128 amount) external',
  'function balanceOf(address user, address token) external view returns (uint128)',
  'function cancel(uint128 orderId) external',
  'struct Order { uint64 id; address token; uint128 amount; uint8 type; int24 tick; }',
  'function getOrders(address user) external view returns (Order[])'
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)'
]);

const FEE_AMM_ABI = parseAbi([
  'function getPool(address userToken, address validatorToken) external view returns (uint128 reserveUserToken, uint128 reserveValidatorToken)',
  'function mint(address userToken, address validatorToken, uint256 amountValidatorToken, address to) external returns (uint256 liquidity)',
  'function mint(address userToken, address validatorToken, uint256 amountUserToken, uint256 amountValidatorToken, address to) external returns (uint256 liquidity)',
  'function burn(address userToken, address validatorToken, uint256 liquidity, address to) external returns (uint256 amountUserToken, uint256 amountValidatorToken)',
  'function rebalanceSwap(address userToken, address validatorToken, uint256 amountOut, address to) external returns (uint256 amountIn)'
]);

// HUB_AMM_ABI for non-Tempo chains
const HUB_AMM_LIQUIDITY_ABI = parseAbi([
  'function addLiquidity(address userToken, address validatorToken, uint256 amount, uint256 deadline) external returns (uint256 mintedShares)',
  'function removeLiquidity(address userToken, address validatorToken, uint256 shareAmount, uint256 minUserOut, uint256 minPathOut, uint256 deadline) external returns (uint256 userOut, uint256 pathOut)',
  'function tokenReserves(address token) external view returns (uint256)',
  'function pathReserves(address token) external view returns (uint256)'
]);

// Helper: Force uint128
export const toUint128 = (amount: bigint) => {
  const max128 = 340282366920938463463374607431768211455n; // 2^128 - 1
  if (amount <= 0n) return 0n;
  if (amount > max128) throw new Error("Amount exceeds uint128 limit");
  return amount;
};

const BALANCE_TTL_MS = 10_000; // 10s — reduces RPC calls; React Query polls handle freshness
const balanceCache = new Map<string, { ts: number; value: string }>();
const balanceRawCache = new Map<string, { ts: number; value: bigint }>();
const inFlight = new Map<string, Promise<string>>();
const inFlightRaw = new Map<string, Promise<bigint>>();

const getCachedBalance = (key: string) => {
  const cached = balanceCache.get(key);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.value;
  return null;
};

const getCachedRaw = (key: string) => {
  const cached = balanceRawCache.get(key);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.value;
  return null;
};

export async function getTokenBalancesBatch(
  client: PublicClient,
  account: string,
  tokens: { address: string; decimals: number }[]
): Promise<Record<string, string>> {
  if (!client || !account || tokens.length === 0) return {};
  const next: Record<string, string> = {};
  const readContracts = (client as PublicClient & { readContracts?: PublicClient['readContracts'] }).readContracts;

  if (readContracts) {
    const contracts = tokens.map((token) => ({
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account as `0x${string}`],
    }));
    const results = await readContracts({
      contracts,
      allowFailure: true,
    });
    results.forEach((result, index) => {
      const token = tokens[index];
      const value = result.status === 'success' ? (result.result as bigint) : 0n;
      const formatted = formatUnits(value, token.decimals);
      const key = `wallet:${account.toLowerCase()}:${token.address.toLowerCase()}`;
      balanceCache.set(key, { ts: Date.now(), value: formatted });
      next[token.address] = formatted;
    });
    return next;
  }

  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const value = (await client.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account as `0x${string}`],
        })) as bigint;
        return { token, value };
      } catch {
        return { token, value: 0n };
      }
    })
  );
  results.forEach(({ token, value }) => {
    const formatted = formatUnits(value, token.decimals);
    const key = `wallet:${account.toLowerCase()}:${token.address.toLowerCase()}`;
    balanceCache.set(key, { ts: Date.now(), value: formatted });
    next[token.address] = formatted;
  });
  return next;
}

export async function getDexBalancesBatch(
  client: PublicClient,
  account: string,
  tokens: { address: string; decimals: number }[],
  chainId?: number
): Promise<Record<string, { formatted: string; raw: bigint }>> {
  if (!client || !account || tokens.length === 0) return {};
  const resolvedChainId = resolveChainId(chainId, client);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  const next: Record<string, { formatted: string; raw: bigint }> = {};
  const readContracts = (client as PublicClient & { readContracts?: PublicClient['readContracts'] }).readContracts;

  if (readContracts) {
    const contracts = tokens.map((token) => ({
      address: dexAddress,
      abi: DEX_ABI,
      functionName: 'balanceOf',
      args: [account as `0x${string}`, token.address as `0x${string}`],
    }));
    const results = await readContracts({
      contracts,
      allowFailure: true,
    });
    results.forEach((result, index) => {
      const token = tokens[index];
      const value = result.status === 'success' ? (result.result as bigint) : 0n;
      const formatted = formatUnits(value, token.decimals);
      const key = `dex:${account.toLowerCase()}:${token.address.toLowerCase()}:${resolvedChainId ?? 'unknown'}`;
      balanceCache.set(key, { ts: Date.now(), value: formatted });
      balanceRawCache.set(key, { ts: Date.now(), value });
      next[token.address] = { formatted, raw: value };
    });
    return next;
  }

  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const value = (await client.readContract({
          address: dexAddress,
          abi: DEX_ABI,
          functionName: 'balanceOf',
          args: [account as `0x${string}`, token.address as `0x${string}`],
        })) as bigint;
        return { token, value };
      } catch {
        return { token, value: 0n };
      }
    })
  );
  results.forEach(({ token, value }) => {
    const formatted = formatUnits(value, token.decimals);
    const key = `dex:${account.toLowerCase()}:${token.address.toLowerCase()}:${resolvedChainId ?? 'unknown'}`;
    balanceCache.set(key, { ts: Date.now(), value: formatted });
    balanceRawCache.set(key, { ts: Date.now(), value });
    next[token.address] = { formatted, raw: value };
  });
  return next;
}

/**
 * Approval helper with receipt wait
 *
 * SECURITY: By default uses exact approval amounts to minimize risk if spender is compromised.
 * Set useUnlimitedApproval=true for gas savings on repeated swaps (user preference).
 *
 * @param client - Wallet client for signing
 * @param publicClient - Public client for reading state
 * @param account - User's account address
 * @param token - Token to approve
 * @param spender - Address to approve spending (DEX contract)
 * @param amount - Amount to approve
 * @param useUnlimitedApproval - If true, approve maxUint256 (saves gas on repeated swaps)
 */
export async function approveToken(
  client: WalletClient,
  publicClient: PublicClient,
  account: string,
  token: string,
  spender: string,
  amount: bigint,
  useUnlimitedApproval = false
) {
  if (token === ZERO_ADDRESS) return true;

  const currentAllowance = await publicClient.readContract({
    address: token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account as `0x${string}`, spender as `0x${string}`]
  }) as bigint;

  if (currentAllowance < amount) {
    // Use exact amount by default for security, unlimited only if explicitly requested
    const approvalAmount = useUnlimitedApproval ? maxUint256 : amount;

    const hash = await client.writeContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender as `0x${string}`, approvalAmount],
      account: account as `0x${string}`,
      chain: null
    });
    // CRITICAL: Wait for receipt
    await publicClient.waitForTransactionReceipt({ hash });
  }
  return true;
}

export async function getDexBalance(
  client: PublicClient,
  account: string,
  token: string,
  decimals: number,
  chainId?: number
): Promise<string> {
  const resolvedChainId = resolveChainId(chainId, client);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  const cacheKey = `dex:${account.toLowerCase()}:${token.toLowerCase()}:${resolvedChainId ?? 'unknown'}`;
  const cached = getCachedBalance(cacheKey);
  if (cached !== null) return cached;
  const inflight = inFlight.get(cacheKey);
  if (inflight) return inflight;
  try {
    const promise = (async () => {
      const bal = (await client.readContract({
        address: dexAddress,
        abi: DEX_ABI,
        functionName: 'balanceOf',
        args: [account as `0x${string}`, token as `0x${string}`]
      })) as bigint;
      const formatted = formatUnits(bal, decimals);
      balanceCache.set(cacheKey, { ts: Date.now(), value: formatted });
      return formatted;
    })();
    inFlight.set(cacheKey, promise);
    const result = await promise;
    inFlight.delete(cacheKey);
    return result;
  } catch (e) {
    console.error('Failed to fetch DEX balance for', token, e);
    inFlight.delete(cacheKey);
    return '0';
  }
}

export async function getDexBalanceRaw(
  client: PublicClient,
  account: string,
  token: string,
  chainId?: number
): Promise<bigint> {
  const resolvedChainId = resolveChainId(chainId, client);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  const cacheKey = `dex:${account.toLowerCase()}:${token.toLowerCase()}:${resolvedChainId ?? 'unknown'}`;
  const cached = getCachedRaw(cacheKey);
  if (cached !== null) return cached;
  const inflight = inFlightRaw.get(cacheKey);
  if (inflight) return inflight;
  try {
    const promise = (async () => {
      const bal = (await client.readContract({
        address: dexAddress,
        abi: DEX_ABI,
        functionName: 'balanceOf',
        args: [account as `0x${string}`, token as `0x${string}`]
      })) as bigint;
      balanceRawCache.set(cacheKey, { ts: Date.now(), value: bal });
      return bal;
    })();
    inFlightRaw.set(cacheKey, promise);
    const result = await promise;
    inFlightRaw.delete(cacheKey);
    return result;
  } catch (e) {
    console.error('Failed to fetch DEX balance for', token, e);
    inFlightRaw.delete(cacheKey);
    return 0n;
  }
}

export async function getPool(
  client: PublicClient,
  userToken: string,
  validatorToken: string,
  chainId?: number
) {
  const resolvedChainId = resolveChainId(chainId, client);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  return client.readContract({
    address: dexAddress,
    abi: DEX_ABI,
    functionName: 'getPool',
    args: [userToken as `0x${string}`, validatorToken as `0x${string}`]
  });
}

export async function getTokenBalance(
  client: PublicClient,
  account: string,
  token: string,
  decimals: number
): Promise<string> {
  try {
    if (!client || !account || !token) return '0.00';
    if (token === ZERO_ADDRESS) {
      const native = await client.getBalance({ address: account as `0x${string}` });
      return formatUnits(native, decimals);
    }
    const cacheKey = `wallet:${account.toLowerCase()}:${token.toLowerCase()}`;
    const cached = getCachedBalance(cacheKey);
    if (cached !== null) return cached;
    const inflight = inFlight.get(cacheKey);
    if (inflight) return inflight;
    const promise = (async () => {
      const raw = (await client.readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account as `0x${string}`]
      })) as bigint;
      const formatted = formatUnits(raw, decimals);
      balanceCache.set(cacheKey, { ts: Date.now(), value: formatted });
      return formatted;
    })();
    inFlight.set(cacheKey, promise);
    const result = await promise;
    inFlight.delete(cacheKey);
    return result;
  } catch (e) {
    // Arc precompile tokens return no data for ERC-20 balanceOf — expected, not an error
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('returned no data') && !msg.includes('0x"')) {
      console.warn('Balance fetch failed for', token, e);
    }
    inFlight.delete(`wallet:${account.toLowerCase()}:${token.toLowerCase()}`);
    return '0';
  }
}

export async function executeSwap(
  client: WalletClient,
  account: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint = 0n,
  skipApproval = false,
  publicClient?: PublicClient,
  chainId?: number
) {
  const resolvedChainId = resolveChainId(chainId, client, publicClient);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  if (!skipApproval && tokenIn !== ZERO_ADDRESS) {
    if (publicClient) {
      await approveToken(client, publicClient, account, tokenIn, dexAddress, amountIn);
    } else {
      // Fallback when no public client is provided.
      await client.writeContract({
        address: tokenIn as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [dexAddress, amountIn],
        account: account as `0x${string}`,
        chain: null
      });
    }
  }
  const isNative = tokenIn === ZERO_ADDRESS;
  return writeContractWithRetry(
    client,
    publicClient,
    {
      address: dexAddress,
      abi: DEX_ABI,
      functionName: 'swapExactAmountIn',
      args: [
        tokenIn as `0x${string}`,
        tokenOut as `0x${string}`,
        toUint128(amountIn),
        toUint128(minAmountOut)
      ],
      account: account as `0x${string}`,
      chain: null,
      value: isNative ? amountIn : 0n
    },
    {
      onRetry: (attempt, gasPrice) => {
        console.info(`Retrying swap (attempt ${attempt}) with gasPrice ${gasPrice.toString()}`);
      }
    }
  );
}

export async function quoteSwapExactAmountIn(
  publicClient: PublicClient,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  chainId?: number
): Promise<bigint> {
  const resolvedChainId = resolveChainId(chainId, publicClient);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  return readContractWithFallback<bigint>(publicClient, {
    address: dexAddress,
    abi: DEX_ABI,
    functionName: 'quoteSwapExactAmountIn',
    args: [tokenIn as `0x${string}`, tokenOut as `0x${string}`, toUint128(amountIn)]
  });
}

export async function provideLiquidity(
  client: WalletClient,
  publicClient: PublicClient,
  account: string,
  baseToken: string,
  spendToken: string,
  amount: bigint,
  type: 'buy' | 'sell',
  tick: number,
  onStage?: (stage: 'approving' | 'placing') => void,
  isFlip: boolean = false,
  chainId?: number,
  flipTick?: number
) {
  const resolvedChainId = resolveChainId(chainId, client, publicClient);
  const dexAddress = getDexAddressForChain(resolvedChainId);

  if (spendToken !== ZERO_ADDRESS) {
    onStage?.('approving');
    await approveToken(client, publicClient, account, spendToken, dexAddress, amount);
  }
  onStage?.('placing');
  if (isFlip) {
    if (typeof flipTick !== 'number') {
      throw new Error('Flip tick required for flip orders');
    }
    return client.writeContract({
      address: dexAddress,
      abi: DEX_ABI,
      functionName: 'placeFlip',
      args: [
        baseToken as `0x${string}`,
        toUint128(amount),
        type === 'buy',
        tick,
        flipTick
      ],
      account: account as `0x${string}`,
      chain: null
    });
  }
  return client.writeContract({
    address: dexAddress,
    abi: DEX_ABI,
    functionName: 'place',
    args: [baseToken as `0x${string}`, toUint128(amount), type === 'buy', tick],
    account: account as `0x${string}`,
    chain: null
  });
}

export async function placeOrder(
  client: WalletClient,
  publicClient: PublicClient,
  account: string,
  tokenAddress: string,
  amountBig: bigint,
  isBuy: boolean,
  tick: number,
  isFlip: boolean = false,
  onStage?: (stage: 'approving' | 'placing') => void,
  chainId?: number,
  flipTick?: number
) {
  const resolvedChainId = resolveChainId(chainId, client, publicClient);
  const dexAddress = getDexAddressForChain(resolvedChainId);

  let tokenToSpend: string;
  let amountToSpend: bigint;

  if (isBuy) {
    tokenToSpend = TEMPO_PATH_USD;
    amountToSpend = amountBig;
  } else {
    tokenToSpend = tokenAddress;
    amountToSpend = amountBig;
  }

  if (tokenToSpend !== ZERO_ADDRESS) {
    onStage?.('approving');
    await approveToken(client, publicClient, account, tokenToSpend, dexAddress, amountToSpend);
  }

  onStage?.('placing');
  if (isFlip) {
    if (typeof flipTick !== 'number') {
      throw new Error('Flip tick required for flip orders');
    }
    return writeContractWithRetry(
      client,
      publicClient,
      {
        address: dexAddress,
        abi: DEX_ABI,
        functionName: 'placeFlip',
        args: [
          tokenAddress as `0x${string}`,
          toUint128(amountBig),
          isBuy,
          tick,
          flipTick
        ],
        account: account as `0x${string}`,
        chain: null
      },
      {
        onRetry: (attempt, gasPrice) => {
          console.info(`Retrying order (attempt ${attempt}) with gasPrice ${gasPrice.toString()}`);
        }
      }
    );
  }
  return writeContractWithRetry(
    client,
    publicClient,
    {
      address: dexAddress,
      abi: DEX_ABI,
      functionName: 'place',
      args: [tokenAddress as `0x${string}`, toUint128(amountBig), isBuy, tick],
      account: account as `0x${string}`,
      chain: null
    },
    {
      onRetry: (attempt, gasPrice) => {
        console.info(`Retrying order (attempt ${attempt}) with gasPrice ${gasPrice.toString()}`);
      }
    }
  );
}

export async function addFeeLiquidity(
  client: WalletClient,
  publicClient: PublicClient,
  account: string,
  userToken: string,
  validatorToken: string,
  amount: bigint,
  onStage?: (stage: 'approving' | 'adding') => void,
  chainId?: number
) {
  const resolvedChainId = resolveChainId(chainId, client, publicClient);
  const isTempoChain = resolvedChainId === 42431;

  // Use different contracts and ABIs based on chain
  const targetAddress = isTempoChain
    ? getFeeManagerAddress(resolvedChainId)
    : getContractAddresses(resolvedChainId).HUB_AMM_ADDRESS;

  onStage?.('approving');

  onStage?.('adding');

  if (isTempoChain) {
    if (validatorToken !== ZERO_ADDRESS) {
      await approveToken(client, publicClient, account, validatorToken, targetAddress, amount);
    }

    // Tempo chain uses FEE_AMM_ABI.mint
    return client.writeContract({
      address: targetAddress,
      abi: FEE_AMM_ABI,
      functionName: 'mint',
      args: [
        userToken as `0x${string}`,
        validatorToken as `0x${string}`,
        amount,
        account as `0x${string}`
      ],
      account: account as `0x${string}`,
      chain: null
    });
  } else {
    onStage?.('approving');
    const pathAmount = await quoteHubLiquidityPathAmount(publicClient, userToken, validatorToken, amount, resolvedChainId);

    await approveToken(client, publicClient, account, userToken, targetAddress, amount);
    if (validatorToken !== ZERO_ADDRESS) {
      await approveToken(client, publicClient, account, validatorToken, targetAddress, pathAmount);
    }

    onStage?.('adding');
    // Non-Tempo chains use HUB_AMM_LIQUIDITY_ABI.addLiquidity with deadline
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (20 * 60)); // 20 minutes
    return client.writeContract({
      address: targetAddress,
      abi: HUB_AMM_LIQUIDITY_ABI,
      functionName: 'addLiquidity',
      args: [
        userToken as `0x${string}`,
        validatorToken as `0x${string}`,
        amount,
        deadlineTimestamp
      ],
      account: account as `0x${string}`,
      chain: null
    });
  }
}

export async function quoteHubLiquidityPathAmount(
  publicClient: PublicClient,
  userToken: string,
  validatorToken: string,
  userAmount: bigint,
  chainId?: number
): Promise<bigint> {
  const resolvedChainId = resolveChainId(chainId, publicClient);
  const hubAmmAddress = getContractAddresses(resolvedChainId).HUB_AMM_ADDRESS;

  const [userReserveRaw, pathReserveRaw, userDecimals, pathDecimals] = await Promise.all([
    publicClient.readContract({
      address: hubAmmAddress,
      abi: HUB_AMM_LIQUIDITY_ABI,
      functionName: 'tokenReserves',
      args: [userToken as `0x${string}`],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: hubAmmAddress,
      abi: HUB_AMM_LIQUIDITY_ABI,
      functionName: 'pathReserves',
      args: [userToken as `0x${string}`],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: userToken as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as Promise<number>,
    publicClient.readContract({
      address: validatorToken as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as Promise<number>,
  ]);

  const normalize = (amount: bigint, decimals: number) => {
    if (decimals === 18) return amount;
    return amount * (10n ** BigInt(18 - decimals));
  };
  const denormalize = (amount: bigint, decimals: number) => {
    if (decimals === 18) return amount;
    return amount / (10n ** BigInt(18 - decimals));
  };

  const userAmountNormalized = normalize(userAmount, userDecimals);
  const userReserveNormalized = normalize(userReserveRaw, userDecimals);
  const pathReserveNormalized = normalize(pathReserveRaw, pathDecimals);

  if (userReserveNormalized === 0n || pathReserveNormalized === 0n) {
    return denormalize(userAmountNormalized, pathDecimals);
  }

  const pathNormalized = (userAmountNormalized * pathReserveNormalized) / userReserveNormalized;
  return denormalize(pathNormalized, pathDecimals);
}

export async function withdrawDexBalance(
  client: WalletClient,
  publicClient: PublicClient | undefined,
  account: string,
  token: string,
  amount: bigint,
  chainId?: number
) {
  const resolvedChainId = resolveChainId(chainId, client, publicClient);
  const dexAddress = getDexAddressForChain(resolvedChainId);
  const txHash = (await client.writeContract({
    address: dexAddress,
    abi: DEX_ABI,
    functionName: 'withdraw',
    args: [token as `0x${string}`, toUint128(amount)],
    account: account as `0x${string}`,
    chain: null
  })) as `0x${string}`;
  if (publicClient) {
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
  return txHash;
}
