import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http, parseAbiItem, parseAbi } from 'viem';
import { getArcTestnetRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getContractAddresses, ZERO_ADDRESS } from '@/config/contracts';
import { getTokens, getHubToken } from '@/config/tokens';

const ARC_CHAIN_ID = 5042002;
const CACHE_TTL_MS = 60_000;
const FULL_SCAN_START_BLOCK = 32_600_000n; // HubAMM deployed ~block 32,655,000
const LOG_CHUNK_SIZE = 9_999n;
const MAX_PARALLEL_CHUNKS = 6;

const ARC_TESTNET = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  testnet: true,
});

const HUB_AMM_ABI = parseAbi([
  'function tokenReserves(address token) external view returns (uint256)',
  'function pathReserves(address token) external view returns (uint256)',
  'function totalShares(address token) external view returns (uint256)',
]);

const ARC_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'
);
const ARC_LIQUIDITY_ADDED_EVENT = parseAbiItem(
  'event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)'
);

const TOKEN_META: Record<string, { color: string; label: string }> = {
  EURC: { color: '#3b82f6', label: 'EU' },
  USDT: { color: '#22c55e', label: 'UT' },
  WUSDC: { color: '#8b5cf6', label: 'WU' },
};

const _allArcTokens = getTokens(ARC_CHAIN_ID);
const _hubToken = getHubToken(ARC_CHAIN_ID);
const ARC_TOKENS = _allArcTokens
  .filter((t) => t.quoteTokenId)
  .map((t) => ({
    symbol: t.symbol,
    address: t.address,
    decimals: t.decimals,
    color: TOKEN_META[t.symbol]?.color ?? '#64748b',
    label: TOKEN_META[t.symbol]?.label ?? t.symbol.slice(0, 2).toUpperCase(),
  }));

const TOKEN_DECIMALS_BY_ADDRESS = new Map(
  ARC_TOKENS.map((token) => [token.address.toLowerCase(), token.decimals] as const)
);

const USDC_ADDRESS = (_hubToken?.address ?? '0x3600000000000000000000000000000000000000') as `0x${string}`;
const USDC_DECIMALS = _hubToken?.decimals ?? 6;

export type PoolStat = {
  pair: string;
  token: string;
  tokenAddress: string;
  color: string;
  label: string;
  liquidity: string;
  liquidityRaw: string;
  vol24h: string;
  vol24hRaw: string;
  swapCount: number;
  hasLiquidity: boolean;
};

type PoolSnapshot = {
  volRaw: string;
  swapCount: number;
};

type PoolStatSnapshot = PoolStat & {
  snapshot: PoolSnapshot;
};

export type PoolStatsResponse = {
  pools: PoolStat[];
  totalLiquidityUsdc: string;
  totalSwaps: number;
  totalVolumeUsdc: string;
  scannedBlocks: number;
  updatedAt: number;
};

type PoolStatsSnapshot = Omit<PoolStatsResponse, 'pools'> & {
  totalVolumeRaw: string;
  latestBlock: string;
  pools: PoolStatSnapshot[];
};

type GlobalCache = typeof globalThis & {
  __poolStatsCache?: { ts: number; data: PoolStatsSnapshot };
};

const g = globalThis as GlobalCache;

function formatUsdc(raw: bigint, decimals = USDC_DECIMALS): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  return `$${whole}`;
}

function normalizeToUsdcRaw(amount: bigint, decimals: number): bigint {
  if (decimals === USDC_DECIMALS) return amount;
  if (decimals > USDC_DECIMALS) return amount / 10n ** BigInt(decimals - USDC_DECIMALS);
  return amount * 10n ** BigInt(USDC_DECIMALS - decimals);
}

function toPublicResponse(snapshot: PoolStatsSnapshot): PoolStatsResponse {
  return {
    pools: (snapshot.pools as PoolStatSnapshot[]).map(({ snapshot: _snapshot, ...pool }) => pool),
    totalLiquidityUsdc: snapshot.totalLiquidityUsdc,
    totalSwaps: snapshot.totalSwaps,
    totalVolumeUsdc: snapshot.totalVolumeUsdc,
    scannedBlocks: snapshot.scannedBlocks,
    updatedAt: snapshot.updatedAt,
  };
}

async function getLogsInChunks(
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  if (fromBlock > toBlock) return { swapLogs: [], addLogs: [] };

  // Build chunk ranges
  const ranges: { start: bigint; end: bigint }[] = [];
  let s = fromBlock;
  while (s <= toBlock) {
    const e = s + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : s + LOG_CHUNK_SIZE - 1n;
    ranges.push({ start: s, end: e });
    s = e + 1n;
  }

  const swapLogs: Awaited<ReturnType<typeof client.getLogs>>[] = [];
  const addLogs: Awaited<ReturnType<typeof client.getLogs>>[] = [];

  // Process chunks in parallel batches of MAX_PARALLEL_CHUNKS
  for (let i = 0; i < ranges.length; i += MAX_PARALLEL_CHUNKS) {
    const batch = ranges.slice(i, i + MAX_PARALLEL_CHUNKS);
    const results = await Promise.all(
      batch.map(({ start, end }) =>
        Promise.all([
          client.getLogs({ address, event: ARC_SWAP_EVENT, fromBlock: start, toBlock: end }),
          client.getLogs({ address, event: ARC_LIQUIDITY_ADDED_EVENT, fromBlock: start, toBlock: end }),
        ])
      )
    );
    for (const [swapChunk, addChunk] of results) {
      swapLogs.push(swapChunk);
      addLogs.push(addChunk);
    }
  }

  return { swapLogs: swapLogs.flat(), addLogs: addLogs.flat() };
}

function buildPoolBaseStats(): PoolStatSnapshot[] {
  return ARC_TOKENS.map((token) => ({
    pair: `${token.symbol} / USDC`,
    token: token.symbol,
    tokenAddress: token.address,
    color: token.color,
    label: token.label,
    liquidity: '$0',
    liquidityRaw: '0',
    vol24h: '$0',
    vol24hRaw: '0',
    swapCount: 0,
    hasLiquidity: false,
    snapshot: {
      volRaw: '0',
      swapCount: 0,
    },
  }));
}

async function enrichWithReserves(
  client: ReturnType<typeof createPublicClient>,
  hubAmm: `0x${string}`,
  latestBlock: bigint,
  pools: PoolStatSnapshot[],
  totalVolumeRaw: bigint,
  totalSwaps: number
): Promise<PoolStatsSnapshot> {
  const reserveResults = await Promise.allSettled(
    ARC_TOKENS.map(async (token) => {
      const [, pathRes] = await Promise.all([
        client.readContract({ address: hubAmm, abi: HUB_AMM_ABI, functionName: 'tokenReserves', args: [token.address] }),
        client.readContract({ address: hubAmm, abi: HUB_AMM_ABI, functionName: 'pathReserves', args: [token.address] }),
      ]);
      return { symbol: token.symbol, pathReserve: pathRes as bigint };
    })
  );

  let totalLiquidityRaw = 0n;
  const withReserves = pools.map((pool, index) => {
    const result = reserveResults[index];
    const pathReserve = result.status === 'fulfilled' ? result.value.pathReserve : 0n;
    totalLiquidityRaw += pathReserve;
    return {
      ...pool,
      liquidityRaw: pathReserve.toString(),
      liquidity: pathReserve > 0n ? formatUsdc(pathReserve, USDC_DECIMALS) : '$0',
      hasLiquidity: pathReserve > 0n,
      vol24hRaw: pool.snapshot.volRaw,
      vol24h: BigInt(pool.snapshot.volRaw) > 0n ? formatUsdc(BigInt(pool.snapshot.volRaw), USDC_DECIMALS) : '$0',
      swapCount: pool.snapshot.swapCount,
    };
  });

  withReserves.sort((a, b) => Number(BigInt(b.liquidityRaw) - BigInt(a.liquidityRaw)));

  return {
    pools: withReserves,
    totalLiquidityUsdc: formatUsdc(totalLiquidityRaw, USDC_DECIMALS),
    totalSwaps,
    totalVolumeRaw: totalVolumeRaw.toString(),
    totalVolumeUsdc: formatUsdc(totalVolumeRaw, USDC_DECIMALS),
    scannedBlocks: Number(latestBlock),
    latestBlock: latestBlock.toString(),
    updatedAt: Date.now(),
  };
}

async function fetchPoolStats(): Promise<PoolStatsSnapshot> {
  const urls = getArcTestnetRpcUrls();
  const hubAmm = getContractAddresses(ARC_CHAIN_ID).HUB_AMM_ADDRESS;

  if (hubAmm === ZERO_ADDRESS) {
    return {
      pools: buildPoolBaseStats(),
      totalLiquidityUsdc: '$0',
      totalSwaps: 0,
      totalVolumeRaw: '0',
      totalVolumeUsdc: '$0',
      scannedBlocks: 0,
      latestBlock: '0',
      updatedAt: Date.now(),
    };
  }

  let lastError: unknown;
  const usdcLower = USDC_ADDRESS.toLowerCase();

  for (const url of urls) {
    try {
      const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 12_000 }) });
      const latestBlock = await client.getBlockNumber();
      const cached = g.__poolStatsCache?.data;

      const basePools = cached?.pools ?? buildPoolBaseStats();
      const poolMap = new Map<string, PoolStatSnapshot>(
        basePools.map((pool) => [pool.tokenAddress.toLowerCase(), { ...pool }])
      );
      let totalVolumeRaw = BigInt(cached?.totalVolumeRaw ?? '0');
      let totalSwaps = cached?.totalSwaps ?? 0;

      const fromBlock = cached ? BigInt(cached.latestBlock) + 1n : FULL_SCAN_START_BLOCK;
      const { swapLogs, addLogs } = await getLogsInChunks(client, hubAmm, fromBlock, latestBlock);

      for (const log of swapLogs) {
      const args = (log as { args?: {
        tokenIn: `0x${string}`;
        tokenOut: `0x${string}`;
        amountIn: bigint;
        amountOut: bigint;
      } }).args;
      if (!args) continue;
      const { tokenIn, tokenOut, amountIn, amountOut } = args;

        let poolKey: string | null = null;
        let volumeDelta = 0n;

        if (tokenIn?.toLowerCase() === usdcLower) {
          poolKey = tokenOut?.toLowerCase() ?? null;
          volumeDelta = amountIn ?? 0n;
        } else if (tokenOut?.toLowerCase() === usdcLower) {
          poolKey = tokenIn?.toLowerCase() ?? null;
          volumeDelta = amountOut ?? 0n;
        }

        if (!poolKey) continue;
        const pool = poolMap.get(poolKey);
        if (!pool) continue;

        pool.snapshot = {
          volRaw: (BigInt(pool.snapshot.volRaw) + volumeDelta).toString(),
          swapCount: pool.snapshot.swapCount + 1,
        };
        totalVolumeRaw += volumeDelta;
        totalSwaps += 1;
      }

      for (const log of addLogs) {
        const args = (log as { args?: {
          provider: `0x${string}`;
          token: `0x${string}`;
          tokenAmount: bigint;
          pathAmount: bigint;
          shares: bigint;
        } }).args;
        if (!args) continue;
        const { token, tokenAmount, pathAmount } = args;
        const poolKey = token?.toLowerCase() ?? null;
        if (!poolKey) continue;
        const pool = poolMap.get(poolKey);
        if (!pool) continue;

        const tokenDecimals = TOKEN_DECIMALS_BY_ADDRESS.get(poolKey) ?? USDC_DECIMALS;
        const addVolumeDelta =
          normalizeToUsdcRaw(tokenAmount ?? 0n, tokenDecimals) +
          normalizeToUsdcRaw(pathAmount ?? 0n, USDC_DECIMALS);

        pool.snapshot = {
          volRaw: (BigInt(pool.snapshot.volRaw) + addVolumeDelta).toString(),
          swapCount: pool.snapshot.swapCount,
        };
        totalVolumeRaw += addVolumeDelta;
      }

      return await enrichWithReserves(
        client,
        hubAmm,
        latestBlock,
        Array.from(poolMap.values()),
        totalVolumeRaw,
        totalSwaps
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('All RPCs failed');
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`pool-stats:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  if (g.__poolStatsCache && Date.now() - g.__poolStatsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(toPublicResponse(g.__poolStatsCache.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    const data = await fetchPoolStats();
    g.__poolStatsCache = { ts: Date.now(), data };
    return NextResponse.json(toPublicResponse(data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('pool-stats error:', err);
    if (g.__poolStatsCache) {
      return NextResponse.json(toPublicResponse(g.__poolStatsCache.data), {
        headers: { 'Cache-Control': 'public, s-maxage=5' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch pool stats' }, { status: 500 });
  }
}
