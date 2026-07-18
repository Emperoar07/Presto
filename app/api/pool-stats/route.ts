import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http, parseAbi } from 'viem';
import { getArcTestnetRpcUrls, raceRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import {
  getContractAddresses,
  getUniswapV2Addresses,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  ZERO_ADDRESS,
} from '@/config/contracts';
import { getTokens, getHubToken } from '@/config/tokens';
import { getPoolStatsRequestMode, mergeForkPoolStats } from '@/lib/forkPoolStats';
import { scanUniswapV2Volume } from '@/lib/uniswapV2Volume';
import { scanHubPoolVolume } from '@/lib/hubPoolVolume';
import { readPoolPathReserves } from '@/lib/poolReserves';

const ARC_CHAIN_ID = 5042002;
const CACHE_TTL_MS = 5 * 60_000;
const FORK_CACHE_TTL_MS = 5 * 60_000;

export const maxDuration = 300;

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

const TOKEN_META: Record<string, { color: string; label: string }> = {
  EURC: { color: '#3b82f6', label: 'EU' },
  USDT: { color: '#22c55e', label: 'UT' },
  WUSDC: { color: '#8b5cf6', label: 'WU' },
  cirBTC: { color: '#f7931a', label: 'CB' },
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
  volumeAvailable: boolean;
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

export type ForkPoolStatsResponse = {
  pool: PoolStat;
  updatedAt: number;
};

type PoolStatsSnapshot = Omit<PoolStatsResponse, 'pools'> & {
  totalVolumeRaw: string;
  latestBlock: string;
  pools: PoolStatSnapshot[];
};

type GlobalCache = typeof globalThis & {
  __poolBaseStatsCache?: { ts: number; data: PoolStatsSnapshot };
  __poolStatsCache?: { ts: number; data: PoolStatsSnapshot };
  __forkPoolStatsCache?: { ts: number; data: ForkPoolStatsResponse };
};

const g = globalThis as GlobalCache;

function formatUsdc(raw: bigint, decimals = USDC_DECIMALS): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  return `$${whole}`;
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

function toPublicPool(pool: PoolStatSnapshot): PoolStat {
  const { snapshot: _snapshot, ...publicPool } = pool;
  return publicPool;
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
    vol24h: '--',
    vol24hRaw: '0',
    swapCount: 0,
    hasLiquidity: false,
    volumeAvailable: false,
    snapshot: {
      volRaw: '0',
      swapCount: 0,
    },
  }));
}

function recalculateTotalLiquidity(snapshot: PoolStatsSnapshot): PoolStatsSnapshot {
  const totalLiquidityRaw = snapshot.pools.reduce(
    (total, pool) => total + BigInt(pool.liquidityRaw),
    0n,
  );
  return { ...snapshot, totalLiquidityUsdc: formatUsdc(totalLiquidityRaw, USDC_DECIMALS) };
}

async function enrichWithForkPool(
  client: ReturnType<typeof createPublicClient>,
  latestBlock: bigint,
  snapshot: PoolStatsSnapshot,
): Promise<PoolStatsSnapshot> {
  const fork = getUniswapV2Addresses(ARC_CHAIN_ID);
  const cirbtc = ARC_TOKENS.find((token) => token.symbol.toLowerCase() === 'cirbtc');
  if (!fork || !cirbtc) return snapshot;

  const pair = await client.readContract({
    address: fork.factory,
    abi: UNISWAP_V2_FACTORY_ABI,
    functionName: 'getPair',
    args: [cirbtc.address, USDC_ADDRESS],
  }) as `0x${string}`;
  if (!pair || pair.toLowerCase() === ZERO_ADDRESS) return snapshot;

  const [token0, reserves, latest] = await Promise.all([
    client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'token0' }) as Promise<`0x${string}`>,
    client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'getReserves' }) as Promise<readonly [bigint, bigint, number]>,
    client.getBlock({ blockNumber: latestBlock }),
  ]);
  const token1 = token0.toLowerCase() === USDC_ADDRESS.toLowerCase() ? cirbtc.address : USDC_ADDRESS;
  const cutoffTimestamp = latest.timestamp > 86_400n ? latest.timestamp - 86_400n : 0n;
  const volume = await scanUniswapV2Volume(
    client,
    pair,
    USDC_ADDRESS,
    token0,
    token1,
    latestBlock,
    cutoffTimestamp,
  );

  const pools = mergeForkPoolStats(snapshot.pools, cirbtc.address, {
    usdc: USDC_ADDRESS,
    token0,
    reserve0: reserves[0],
    reserve1: reserves[1],
    volumeRaw: volume.volumeRaw,
    swapCount: volume.swapCount,
    volumeAvailable: true,
  });
  return recalculateTotalLiquidity({ ...snapshot, pools });
}

async function enrichWithReserves(
  client: ReturnType<typeof createPublicClient>,
  hubAmm: `0x${string}`,
  latestBlock: bigint,
  pools: PoolStatSnapshot[],
  totalVolumeRaw: bigint,
  totalSwaps: number
): Promise<PoolStatsSnapshot> {
  const pathReserves = await readPoolPathReserves(
    ARC_TOKENS,
    async (token) => client.readContract({
      address: hubAmm,
      abi: HUB_AMM_ABI,
      functionName: 'pathReserves',
      args: [token.address],
    }) as Promise<bigint>
  );

  let totalLiquidityRaw = 0n;
  const withReserves = pools.map((pool, index) => {
    const pathReserve = pathReserves[index] ?? 0n;
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

  return raceRpcUrls(getArcTestnetRpcUrls(), async (url) => {
    const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 12_000 }) });
    const latestBlock = await client.getBlockNumber();
    const latest = await client.getBlock({ blockNumber: latestBlock });
    const cutoffTimestamp = latest.timestamp > 86_400n ? latest.timestamp - 86_400n : 0n;
    const activity = await scanHubPoolVolume(
      client,
      hubAmm,
      USDC_ADDRESS,
      TOKEN_DECIMALS_BY_ADDRESS,
      latestBlock,
      cutoffTimestamp,
    );
    let totalVolumeRaw = 0n;
    let totalSwaps = 0;
    const pools = buildPoolBaseStats().map((pool) => {
      const metrics = activity.pools.get(pool.tokenAddress.toLowerCase());
      const volumeRaw = metrics?.volumeRaw ?? 0n;
      const swapCount = metrics?.swapCount ?? 0;
      totalVolumeRaw += volumeRaw;
      totalSwaps += swapCount;
      return {
        ...pool,
        vol24h: formatUsdc(volumeRaw, USDC_DECIMALS),
        vol24hRaw: volumeRaw.toString(),
        swapCount,
        volumeAvailable: pool.token.toLowerCase() !== 'cirbtc',
        snapshot: { volRaw: volumeRaw.toString(), swapCount },
      };
    });

    return {
      pools,
      totalLiquidityUsdc: '$0',
      totalSwaps,
      totalVolumeRaw: totalVolumeRaw.toString(),
      totalVolumeUsdc: formatUsdc(totalVolumeRaw, USDC_DECIMALS),
      scannedBlocks: Number(latestBlock - activity.fromBlock + 1n),
      latestBlock: latestBlock.toString(),
      updatedAt: Date.now(),
    };
  });
}

async function fetchPoolBaseStats(): Promise<PoolStatsSnapshot> {
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

  return raceRpcUrls(getArcTestnetRpcUrls(), async (url) => {
    const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 8_000 }) });
    const latestBlock = await client.getBlockNumber();
    return enrichWithReserves(client, hubAmm, latestBlock, buildPoolBaseStats(), 0n, 0);
  });
}

async function fetchForkPoolStats(): Promise<ForkPoolStatsResponse> {
  const cirbtc = buildPoolBaseStats().find((pool) => pool.token.toLowerCase() === 'cirbtc');
  if (!cirbtc) throw new Error('cirBTC pool is not configured');

  return raceRpcUrls(getArcTestnetRpcUrls(), async (url) => {
    const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 12_000 }) });
    const latestBlock = await client.getBlockNumber();
    const emptySnapshot: PoolStatsSnapshot = {
      pools: [cirbtc],
      totalLiquidityUsdc: '$0',
      totalSwaps: 0,
      totalVolumeRaw: '0',
      totalVolumeUsdc: '$0',
      scannedBlocks: Number(latestBlock),
      latestBlock: latestBlock.toString(),
      updatedAt: Date.now(),
    };
    const enriched = await enrichWithForkPool(client, latestBlock, emptySnapshot);
    const pool = enriched.pools.find((candidate) => candidate.tokenAddress.toLowerCase() === cirbtc.tokenAddress.toLowerCase());
    if (!pool?.volumeAvailable) throw new Error('Fork pool volume is unavailable');
    return { pool: toPublicPool(pool), updatedAt: enriched.updatedAt };
  });
}

export async function GET(request: Request) {
  const mode = getPoolStatsRequestMode(request.url);
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`pool-stats:${mode}:${ip}`, mode === 'base' ? 30 : 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  if (mode === 'fork') {
    if (g.__forkPoolStatsCache && Date.now() - g.__forkPoolStatsCache.ts < FORK_CACHE_TTL_MS) {
      return NextResponse.json(g.__forkPoolStatsCache.data, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }
    try {
      const data = await fetchForkPoolStats();
      g.__forkPoolStatsCache = { ts: Date.now(), data };
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    } catch (error) {
      console.error('fork pool-stats error:', error);
      if (g.__forkPoolStatsCache) return NextResponse.json(g.__forkPoolStatsCache.data);
      return NextResponse.json({ error: 'Failed to fetch fork pool stats' }, { status: 503 });
    }
  }

  if (mode === 'activity') {
    if (g.__poolStatsCache && Date.now() - g.__poolStatsCache.ts < CACHE_TTL_MS) {
      return NextResponse.json(toPublicResponse(g.__poolStatsCache.data), {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
      });
    }
    try {
      const data = await fetchPoolStats();
      g.__poolStatsCache = { ts: Date.now(), data };
      return NextResponse.json(toPublicResponse(data), {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
      });
    } catch (error) {
      console.error('pool activity-stats error:', error);
      if (g.__poolStatsCache) return NextResponse.json(toPublicResponse(g.__poolStatsCache.data));
      return NextResponse.json({ error: 'Failed to fetch pool activity' }, { status: 503 });
    }
  }

  if (g.__poolBaseStatsCache && Date.now() - g.__poolBaseStatsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(toPublicResponse(g.__poolBaseStatsCache.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    const data = await fetchPoolBaseStats();
    g.__poolBaseStatsCache = { ts: Date.now(), data };
    return NextResponse.json(toPublicResponse(data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('pool base-stats error:', err);
    if (g.__poolBaseStatsCache) {
      return NextResponse.json(toPublicResponse(g.__poolBaseStatsCache.data), {
        headers: { 'Cache-Control': 'public, s-maxage=5' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch pool stats' }, { status: 500 });
  }
}
