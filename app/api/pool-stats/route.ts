import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http, parseAbiItem, parseAbi } from 'viem';
import { getArcTestnetRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getContractAddresses, ZERO_ADDRESS } from '@/config/contracts';
import { getTokens, getHubToken } from '@/config/tokens';

const ARC_CHAIN_ID = 5042002;
const SCAN_BLOCKS = 5000n;
const CACHE_TTL_MS = 20_000;

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

// Token display metadata — colours/labels for UI only, addresses sourced from config/tokens.ts
const TOKEN_META: Record<string, { color: string; label: string }> = {
  EURC:  { color: '#3b82f6', label: 'EU' },
  USDT:  { color: '#22c55e', label: 'UT' },
  WUSDC: { color: '#8b5cf6', label: 'WU' },
};

// Derive non-hub Arc tokens from config (single source of truth)
const _allArcTokens = getTokens(ARC_CHAIN_ID);
const _hubToken = getHubToken(ARC_CHAIN_ID);
const ARC_TOKENS = _allArcTokens
  .filter(t => t.quoteTokenId) // non-hub tokens only
  .map(t => ({
    symbol:   t.symbol,
    address:  t.address,
    decimals: t.decimals,
    color:    TOKEN_META[t.symbol]?.color ?? '#64748b',
    label:    TOKEN_META[t.symbol]?.label ?? t.symbol.slice(0, 2).toUpperCase(),
  }));

const USDC_ADDRESS = (_hubToken?.address ?? '0x3600000000000000000000000000000000000000') as `0x${string}`;
const USDC_DECIMALS = _hubToken?.decimals ?? 6;

function formatUsdc(raw: bigint, decimals = USDC_DECIMALS): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  return `$${whole}`;
}

export type PoolStat = {
  pair: string;
  token: string;
  tokenAddress: string;
  color: string;
  label: string;
  liquidity: string;       // formatted USDC value
  liquidityRaw: string;    // pathReserves bigint as string
  vol24h: string;          // formatted swap volume in last scan window
  vol24hRaw: string;
  swapCount: number;
  hasLiquidity: boolean;
};

export type PoolStatsResponse = {
  pools: PoolStat[];
  totalLiquidityUsdc: string;
  totalSwaps: number;
  totalVolumeUsdc: string;
  scannedBlocks: number;
  updatedAt: number;
};

type GlobalCache = typeof globalThis & { __poolStatsCache?: { ts: number; data: PoolStatsResponse } };
const g = globalThis as GlobalCache;

async function fetchPoolStats(): Promise<PoolStatsResponse> {
  const urls = getArcTestnetRpcUrls();
  const hubAmm = getContractAddresses(ARC_CHAIN_ID).HUB_AMM_ADDRESS;

  if (hubAmm === ZERO_ADDRESS) {
    return { pools: [], totalLiquidityUsdc: '$0', totalSwaps: 0, totalVolumeUsdc: '$0', scannedBlocks: 0, updatedAt: Date.now() };
  }

  let lastError: unknown;
  for (const url of urls) {
    try {
      const client = createPublicClient({ chain: ARC_TESTNET, transport: http(url, { timeout: 12_000 }) });
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > SCAN_BLOCKS ? latestBlock - SCAN_BLOCKS : 0n;

      // Fetch reserves + swap events in parallel
      const [reserveResults, swapLogs, addLogs] = await Promise.all([
        Promise.allSettled(
          ARC_TOKENS.map(async (token) => {
            const [tokenRes, pathRes] = await Promise.all([
              client.readContract({ address: hubAmm, abi: HUB_AMM_ABI, functionName: 'tokenReserves', args: [token.address] }),
              client.readContract({ address: hubAmm, abi: HUB_AMM_ABI, functionName: 'pathReserves', args: [token.address] }),
            ]);
            return { symbol: token.symbol, tokenReserve: tokenRes as bigint, pathReserve: pathRes as bigint };
          })
        ),
        client.getLogs({ address: hubAmm, event: ARC_SWAP_EVENT, fromBlock, toBlock: latestBlock }),
        client.getLogs({ address: hubAmm, event: ARC_LIQUIDITY_ADDED_EVENT, fromBlock, toBlock: latestBlock }),
      ]);

      // Aggregate swap volume per token
      const volByToken = new Map<string, bigint>();
      const swapCountByToken = new Map<string, number>();

      for (const log of swapLogs) {
        const { tokenIn, tokenOut, amountIn, amountOut } = log.args as {
          tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint; amountOut: bigint;
        };
        // Volume counted as USDC side of each swap
        const tokenInLower = tokenIn?.toLowerCase();
        const tokenOutLower = tokenOut?.toLowerCase();
        const usdcLower = USDC_ADDRESS.toLowerCase();

        if (tokenInLower === usdcLower) {
          // USDC → token: volume on the token's pool
          const key = tokenOutLower;
          volByToken.set(key, (volByToken.get(key) ?? 0n) + (amountIn ?? 0n));
          swapCountByToken.set(key, (swapCountByToken.get(key) ?? 0) + 1);
        } else if (tokenOutLower === usdcLower) {
          // token → USDC
          const key = tokenInLower;
          volByToken.set(key, (volByToken.get(key) ?? 0n) + (amountOut ?? 0n));
          swapCountByToken.set(key, (swapCountByToken.get(key) ?? 0) + 1);
        }
      }

      let totalLiqRaw = 0n;
      let totalVolRaw = 0n;
      let totalSwaps = 0;

      const pools: PoolStat[] = ARC_TOKENS.map((token, i) => {
        const result = reserveResults[i];
        const pathReserve = result.status === 'fulfilled' ? result.value.pathReserve : 0n;
        const hasLiquidity = pathReserve > 0n;

        // pathReserves is the USDC side — it's in 6 decimals (USDC)
        totalLiqRaw += pathReserve;

        const volRaw = volByToken.get(token.address.toLowerCase()) ?? 0n;
        totalVolRaw += volRaw;
        const count = swapCountByToken.get(token.address.toLowerCase()) ?? 0;
        totalSwaps += count;

        return {
          pair: `${token.symbol} / USDC`,
          token: token.symbol,
          tokenAddress: token.address,
          color: token.color,
          label: token.label,
          liquidity: hasLiquidity ? formatUsdc(pathReserve, USDC_DECIMALS) : '$0',
          liquidityRaw: pathReserve.toString(),
          vol24h: volRaw > 0n ? formatUsdc(volRaw, USDC_DECIMALS) : '$0',
          vol24hRaw: volRaw.toString(),
          swapCount: count,
          hasLiquidity,
        };
      });

      // Sort by liquidity descending, only include pools with liquidity
      pools.sort((a, b) => Number(BigInt(b.liquidityRaw) - BigInt(a.liquidityRaw)));

      return {
        pools,
        totalLiquidityUsdc: formatUsdc(totalLiqRaw, USDC_DECIMALS),
        totalSwaps,
        totalVolumeUsdc: formatUsdc(totalVolRaw, USDC_DECIMALS),
        scannedBlocks: Number(latestBlock - fromBlock),
        updatedAt: Date.now(),
      };
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
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } });
  }

  if (g.__poolStatsCache && Date.now() - g.__poolStatsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(g.__poolStatsCache.data, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
  }

  try {
    const data = await fetchPoolStats();
    g.__poolStatsCache = { ts: Date.now(), data };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
  } catch (err) {
    console.error('pool-stats error:', err);
    if (g.__poolStatsCache) {
      return NextResponse.json(g.__poolStatsCache.data, { headers: { 'Cache-Control': 'public, s-maxage=5' } });
    }
    return NextResponse.json({ error: 'Failed to fetch pool stats' }, { status: 500 });
  }
}
