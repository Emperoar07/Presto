import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http, parseAbiItem } from 'viem';
import { getArcTestnetRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getContractAddresses, ZERO_ADDRESS } from '@/config/contracts';
import { getTokens, getHubToken } from '@/config/tokens';

const ARC_CHAIN_ID = 5042002;
const SCAN_BLOCKS = 5000n; // ~last 5000 blocks for live stats
const CACHE_TTL_MS = 20_000; // 20s cache

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
  totalVolumeUSDC: string;   // raw sum of amountIn for USDC-in swaps, 6-decimal formatted
  totalLiquidityEvents: number;
  uniqueTraders: number;
  scannedBlocks: number;
  latestBlock: string;
  updatedAt: number;
};

type GlobalCache = typeof globalThis & { __dexStatsCache?: { ts: number; data: DexStats } };
const g = globalThis as GlobalCache;

function formatUsdc(raw: bigint): string {
  // USDC is 6 decimals on Arc
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  return `$${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`;
}

async function fetchStats(): Promise<DexStats> {
  const urls = getArcTestnetRpcUrls();
  const dexAddress = getContractAddresses(ARC_CHAIN_ID).HUB_AMM_ADDRESS;

  if (dexAddress === ZERO_ADDRESS) {
    return { totalSwaps: 0, totalVolumeUSDC: '$0', totalLiquidityEvents: 0, uniqueTraders: 0, scannedBlocks: 0, latestBlock: '0', updatedAt: Date.now() };
  }

  let lastError: unknown;
  for (const url of urls) {
    try {
      const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 12_000 }) });
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > SCAN_BLOCKS ? latestBlock - SCAN_BLOCKS : 0n;

      const [swapLogs, addLogs] = await Promise.all([
        client.getLogs({ address: dexAddress, event: ARC_SWAP_EVENT, fromBlock, toBlock: latestBlock }),
        client.getLogs({ address: dexAddress, event: ARC_LIQUIDITY_ADDED_EVENT, fromBlock, toBlock: latestBlock }),
      ]);

      // Sum volume: use amountIn when tokenIn is USDC (6 decimals), else amountOut when tokenOut is USDC
      const USDC = (getHubToken(ARC_CHAIN_ID)?.address ?? '0x3600000000000000000000000000000000000000').toLowerCase();
      let volumeRaw = 0n;
      const traders = new Set<string>();

      for (const log of swapLogs) {
        const { user, tokenIn, tokenOut, amountIn, amountOut } = log.args as {
          user: `0x${string}`;
          tokenIn: `0x${string}`;
          tokenOut: `0x${string}`;
          amountIn: bigint;
          amountOut: bigint;
        };
        traders.add(user.toLowerCase());
        if (tokenIn?.toLowerCase() === USDC) {
          volumeRaw += amountIn ?? 0n;
        } else if (tokenOut?.toLowerCase() === USDC) {
          volumeRaw += amountOut ?? 0n;
        }
      }

      for (const log of addLogs) {
        const provider = (log.args as { provider: `0x${string}` }).provider;
        if (provider) traders.add(provider.toLowerCase());
      }

      return {
        totalSwaps: swapLogs.length,
        totalVolumeUSDC: formatUsdc(volumeRaw),
        totalLiquidityEvents: addLogs.length,
        uniqueTraders: traders.size,
        scannedBlocks: Number(latestBlock - fromBlock),
        latestBlock: latestBlock.toString(),
        updatedAt: Date.now(),
      };
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
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } });
  }

  // Serve from cache if fresh
  if (g.__dexStatsCache && Date.now() - g.__dexStatsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(g.__dexStatsCache.data, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
  }

  try {
    const data = await fetchStats();
    g.__dexStatsCache = { ts: Date.now(), data };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
  } catch (err) {
    console.error('dex-stats error:', err);
    // Return stale cache if available
    if (g.__dexStatsCache) {
      return NextResponse.json(g.__dexStatsCache.data, { headers: { 'Cache-Control': 'public, s-maxage=5' } });
    }
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
