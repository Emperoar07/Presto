import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http, parseAbiItem } from 'viem';
import { getArcTestnetRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getContractAddresses, ZERO_ADDRESS } from '@/config/contracts';
import { getHubToken, getTokens } from '@/config/tokens';

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
  blockExplorers: { default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
});

const ARC_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'
);
const ARC_LIQUIDITY_ADDED_EVENT = parseAbiItem(
  'event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)'
);

export type DexStats = {
  totalSwaps: number;
  totalVolumeUSDC: string;
  totalLiquidityEvents: number;
  uniqueTraders: number;
  scannedBlocks: number;
  latestBlock: string;
  updatedAt: number;
};

type DexStatsSnapshot = DexStats & {
  totalVolumeRaw: string;
  traders: string[];
};

type GlobalCache = typeof globalThis & {
  __dexStatsCache?: { ts: number; data: DexStatsSnapshot };
};

const g = globalThis as GlobalCache;

function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  return `$${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`;
}

function normalizeToUsdcRaw(amount: bigint, decimals: number): bigint {
  if (decimals === 6) return amount;
  if (decimals > 6) return amount / 10n ** BigInt(decimals - 6);
  return amount * 10n ** BigInt(6 - decimals);
}

function toPublicStats(snapshot: DexStatsSnapshot): DexStats {
  return {
    totalSwaps: snapshot.totalSwaps,
    totalVolumeUSDC: snapshot.totalVolumeUSDC,
    totalLiquidityEvents: snapshot.totalLiquidityEvents,
    uniqueTraders: snapshot.uniqueTraders,
    scannedBlocks: snapshot.scannedBlocks,
    latestBlock: snapshot.latestBlock,
    updatedAt: snapshot.updatedAt,
  };
}

async function getLogsInChunks(
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  event: typeof ARC_SWAP_EVENT | typeof ARC_LIQUIDITY_ADDED_EVENT,
  fromBlock: bigint,
  toBlock: bigint
) {
  if (fromBlock > toBlock) return [];

  // Build chunk ranges
  const ranges: { start: bigint; end: bigint }[] = [];
  let s = fromBlock;
  while (s <= toBlock) {
    const e = s + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : s + LOG_CHUNK_SIZE - 1n;
    ranges.push({ start: s, end: e });
    s = e + 1n;
  }

  const logs: Awaited<ReturnType<typeof client.getLogs>>[] = [];

  // Process chunks in parallel batches of MAX_PARALLEL_CHUNKS
  for (let i = 0; i < ranges.length; i += MAX_PARALLEL_CHUNKS) {
    const batch = ranges.slice(i, i + MAX_PARALLEL_CHUNKS);
    const results = await Promise.all(
      batch.map(({ start, end }) =>
        client.getLogs({ address, event, fromBlock: start, toBlock: end })
      )
    );
    logs.push(...results);
  }

  return logs.flat();
}

function aggregateStats(
  snapshot: DexStatsSnapshot,
  swapLogs: Awaited<ReturnType<typeof getLogsInChunks>>,
  addLogs: Awaited<ReturnType<typeof getLogsInChunks>>,
  tokenDecimalsByAddress: Map<string, number>,
  hubDecimals: number,
  usdcAddress: string,
  latestBlock: bigint
): DexStatsSnapshot {
  const traders = new Set(snapshot.traders);
  let volumeRaw = BigInt(snapshot.totalVolumeRaw);
  let totalSwaps = snapshot.totalSwaps;
  let totalLiquidityEvents = snapshot.totalLiquidityEvents;

  for (const log of swapLogs) {
    const args = (log as { args?: {
      user: `0x${string}`;
      tokenIn: `0x${string}`;
      tokenOut: `0x${string}`;
      amountIn: bigint;
      amountOut: bigint;
    } }).args;
    if (!args) continue;
    const { user, tokenIn, tokenOut, amountIn, amountOut } = args;
    if (user) traders.add(user.toLowerCase());

    // Hub AMM routes all swaps through USDC internally.
    // tokenIn/tokenOut are user tokens — normalize amountIn to USDC value.
    if (tokenIn?.toLowerCase() === usdcAddress) {
      volumeRaw += amountIn ?? 0n;
    } else if (tokenOut?.toLowerCase() === usdcAddress) {
      volumeRaw += amountOut ?? 0n;
    } else {
      // Token-to-token swap through the hub — use amountIn normalized to USDC
      const inDecimals = tokenDecimalsByAddress.get(tokenIn?.toLowerCase() ?? '') ?? hubDecimals;
      volumeRaw += normalizeToUsdcRaw(amountIn ?? 0n, inDecimals);
    }
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
    const { provider, token, tokenAmount, pathAmount } = args;
    if (provider) traders.add(provider.toLowerCase());

    const tokenDecimals = tokenDecimalsByAddress.get(token?.toLowerCase() ?? '') ?? hubDecimals;
    volumeRaw += normalizeToUsdcRaw(tokenAmount ?? 0n, tokenDecimals);
    volumeRaw += normalizeToUsdcRaw(pathAmount ?? 0n, hubDecimals);
  }

  totalSwaps += swapLogs.length;
  totalLiquidityEvents += addLogs.length;

  return {
    totalSwaps,
    totalVolumeRaw: volumeRaw.toString(),
    totalVolumeUSDC: formatUsdc(volumeRaw),
    totalLiquidityEvents,
    uniqueTraders: traders.size,
    traders: Array.from(traders),
    scannedBlocks: Number(latestBlock),
    latestBlock: latestBlock.toString(),
    updatedAt: Date.now(),
  };
}

async function fetchStats(): Promise<DexStatsSnapshot> {
  const urls = getArcTestnetRpcUrls();
  const dexAddress = getContractAddresses(ARC_CHAIN_ID).HUB_AMM_ADDRESS;

  if (dexAddress === ZERO_ADDRESS) {
    return {
      totalSwaps: 0,
      totalVolumeRaw: '0',
      totalVolumeUSDC: '$0',
      totalLiquidityEvents: 0,
      uniqueTraders: 0,
      traders: [],
      scannedBlocks: 0,
      latestBlock: '0',
      updatedAt: Date.now(),
    };
  }

  let lastError: unknown;
  const tokens = getTokens(ARC_CHAIN_ID);
  const tokenDecimalsByAddress = new Map(tokens.map((token) => [token.address.toLowerCase(), token.decimals] as const));
  const hubToken = getHubToken(ARC_CHAIN_ID);
  const hubDecimals = hubToken?.decimals ?? 6;
  const usdcAddress = (hubToken?.address ?? '0x3600000000000000000000000000000000000000').toLowerCase();

  for (const url of urls) {
    try {
      const client = createPublicClient({
        chain: ARC_TESTNET,
        transport: http(url, { timeout: 12_000 }),
      });
      const latestBlock = await client.getBlockNumber();
      const cached = g.__dexStatsCache?.data;

      if (cached) {
        const cachedLatest = BigInt(cached.latestBlock);
        if (cachedLatest >= latestBlock) {
          return { ...cached, updatedAt: Date.now() };
        }

        const deltaFromBlock = cachedLatest + 1n;
        const [swapLogs, addLogs] = await Promise.all([
          getLogsInChunks(client, dexAddress, ARC_SWAP_EVENT, deltaFromBlock, latestBlock),
          getLogsInChunks(client, dexAddress, ARC_LIQUIDITY_ADDED_EVENT, deltaFromBlock, latestBlock),
        ]);

        return aggregateStats(
          cached,
          swapLogs,
          addLogs,
          tokenDecimalsByAddress,
          hubDecimals,
          usdcAddress,
          latestBlock
        );
      }

      const [swapLogs, addLogs] = await Promise.all([
        getLogsInChunks(client, dexAddress, ARC_SWAP_EVENT, FULL_SCAN_START_BLOCK, latestBlock),
        getLogsInChunks(client, dexAddress, ARC_LIQUIDITY_ADDED_EVENT, FULL_SCAN_START_BLOCK, latestBlock),
      ]);

      return aggregateStats(
        {
          totalSwaps: 0,
          totalVolumeRaw: '0',
          totalVolumeUSDC: '$0',
          totalLiquidityEvents: 0,
          uniqueTraders: 0,
          traders: [],
          scannedBlocks: 0,
          latestBlock: '0',
          updatedAt: Date.now(),
        },
        swapLogs,
        addLogs,
        tokenDecimalsByAddress,
        hubDecimals,
        usdcAddress,
        latestBlock
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('All RPC endpoints failed');
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`dex-stats:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  if (g.__dexStatsCache && Date.now() - g.__dexStatsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(toPublicStats(g.__dexStatsCache.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    const data = await fetchStats();
    g.__dexStatsCache = { ts: Date.now(), data };
    return NextResponse.json(toPublicStats(data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('dex-stats error:', err);
    if (g.__dexStatsCache) {
      return NextResponse.json(toPublicStats(g.__dexStatsCache.data), {
        headers: { 'Cache-Control': 'public, s-maxage=5' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
