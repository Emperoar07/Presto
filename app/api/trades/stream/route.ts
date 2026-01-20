import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { tempoModerato } from 'viem/chains';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

type Trade = {
  hash: string;
  blockNumber: bigint;
  type: 'Buy' | 'Sell';
  amountIn: string;
  amountOut: string;
  price: string;
};

const DEFAULT_RPCS = tempoModerato.rpcUrls.default.http;
const RPC_URLS = (process.env.TEMPO_RPC_URLS ?? process.env.TEMPO_RPC_URL ?? DEFAULT_RPCS[0])
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

const createClient = (url: string) =>
  createPublicClient({
    chain: tempoModerato,
    transport: http(url, { timeout: 8000 }),
  });

type RpcStats = { avg: number; samples: number; failures: number; disabledUntil: number };
const globalStats = globalThis as typeof globalThis & { __tradesRpcStats?: Map<string, RpcStats> };
const rpcStats = globalStats.__tradesRpcStats ?? new Map<string, RpcStats>();
globalStats.__tradesRpcStats = rpcStats;

const markRpcSuccess = (key: string, durationMs: number) => {
  const entry = rpcStats.get(key);
  if (!entry) {
    rpcStats.set(key, { avg: durationMs, samples: 1, failures: 0, disabledUntil: 0 });
    return;
  }
  const nextSamples = entry.samples + 1;
  const nextAvg = (entry.avg * entry.samples + durationMs) / nextSamples;
  rpcStats.set(key, { avg: nextAvg, samples: nextSamples, failures: 0, disabledUntil: entry.disabledUntil });
};

const markRpcFailure = (key: string) => {
  const entry = rpcStats.get(key) ?? { avg: 0, samples: 0, failures: 0, disabledUntil: 0 };
  const failures = entry.failures + 1;
  const disabledUntil = failures >= 3 ? Date.now() + 30_000 : entry.disabledUntil;
  rpcStats.set(key, { ...entry, failures, disabledUntil });
};

const sortRpcClients = (clients: { url: string; client: ReturnType<typeof createClient> }[]) => {
  const now = Date.now();
  const usable = clients.filter(({ url }) => {
    const entry = rpcStats.get(url);
    return !entry || entry.disabledUntil <= now;
  });
  const fallback = usable.length > 0 ? usable : clients;
  return fallback.sort((a, b) => {
    const aStat = rpcStats.get(a.url);
    const bStat = rpcStats.get(b.url);
    const aScore = aStat?.avg ?? Number.MAX_SAFE_INTEGER;
    const bScore = bStat?.avg ?? Number.MAX_SAFE_INTEGER;
    return aScore - bScore;
  });
};

const clients = RPC_URLS.map((url) => ({ url, client: createClient(url) }));

// ============================================================================
// LRU Cache with TTL for lastBlockByPair to prevent unbounded memory growth
// ============================================================================
const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type CacheEntry = { block: bigint; lastAccess: number };
const lastBlockByPair = new Map<string, CacheEntry>();

/**
 * Prune stale entries and enforce max size (LRU eviction)
 */
function pruneCache(): void {
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of lastBlockByPair.entries()) {
    if (now - entry.lastAccess > CACHE_TTL_MS) {
      lastBlockByPair.delete(key);
    }
  }

  // If still over limit, remove oldest entries (LRU)
  if (lastBlockByPair.size > MAX_CACHE_ENTRIES) {
    const entries = Array.from(lastBlockByPair.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toRemove = entries.length - MAX_CACHE_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      lastBlockByPair.delete(entries[i][0]);
    }
  }
}

/**
 * Get cached block for a pair
 */
function getCachedBlock(pair: string): bigint | undefined {
  const entry = lastBlockByPair.get(pair);
  if (entry) {
    entry.lastAccess = Date.now(); // Update access time
    return entry.block;
  }
  return undefined;
}

/**
 * Set cached block for a pair
 */
function setCachedBlock(pair: string, block: bigint): void {
  pruneCache(); // Prune before adding
  lastBlockByPair.set(pair, { block, lastAccess: Date.now() });
}

const isValidAddress = (value: string | null) => !!value && /^0x[a-fA-F0-9]{40}$/.test(value);

const formatTrades = (logs: any[], tokenA: { address: string; decimals: number }, tokenB: { address: string; decimals: number }): Trade[] => {
  const sorted = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const token0 = sorted ? tokenA : tokenB;
  const token1 = sorted ? tokenB : tokenA;

  return logs.map((log) => {
    const { amount0In, amount1In, amount0Out, amount1Out } = log.args;
    let type: 'Buy' | 'Sell' = 'Buy';
    let amountInVal = 0n;
    let amountOutVal = 0n;

    if (amount0In && amount0In > 0n) {
      type = sorted ? 'Sell' : 'Buy';
      amountInVal = amount0In;
      amountOutVal = amount1Out || 0n;
    } else {
      type = sorted ? 'Buy' : 'Sell';
      amountInVal = amount1In || 0n;
      amountOutVal = amount0Out || 0n;
    }

    const formattedAmountIn = formatUnits(amountInVal, sorted ? token0.decimals : token1.decimals);
    const formattedAmountOut = formatUnits(amountOutVal, sorted ? token1.decimals : token0.decimals);

    const numIn = Number(formattedAmountIn);
    const numOut = Number(formattedAmountOut);

    let displayPrice = '0';
    if (numIn > 0 && numOut > 0) {
      displayPrice = type === 'Buy' ? (numIn / numOut).toFixed(6) : (numOut / numIn).toFixed(6);
    }

    return {
      hash: log.transactionHash,
      blockNumber: log.blockNumber,
      type,
      amountIn: type === 'Buy' ? formatUnits(amountInVal, token1.decimals) : formatUnits(amountInVal, token0.decimals),
      amountOut: type === 'Buy' ? formatUnits(amountOutVal, token0.decimals) : formatUnits(amountOutVal, token1.decimals),
      price: displayPrice,
    };
  });
};

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`trades-stream:${ip}`, 30, 60_000);
  if (!allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() },
    });
  }

  const { searchParams } = new URL(request.url);
  const pair = searchParams.get('pair');
  const tokenA = searchParams.get('tokenA');
  const tokenB = searchParams.get('tokenB');
  const decimalsA = Number(searchParams.get('decimalsA') ?? '6');
  const decimalsB = Number(searchParams.get('decimalsB') ?? '6');

  if (!isValidAddress(pair) || !isValidAddress(tokenA) || !isValidAddress(tokenB)) {
    return new Response('Invalid params', { status: 400 });
  }

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        let lastError: unknown;
        const orderedClients = sortRpcClients(clients);
        for (const { url, client } of orderedClients) {
          try {
            const start = Date.now();
            const latestBlock = await client.getBlockNumber();
            const cachedBlock = getCachedBlock(pair!);
            const lastBlock = cachedBlock ?? (latestBlock > 10000n ? latestBlock - 10000n : 0n);
            const fromBlock = lastBlock + 1n;
            if (fromBlock > latestBlock) return;

            const logs = await client.getLogs({
              address: pair as `0x${string}`,
              event: parseAbiItem('event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'),
              fromBlock,
              toBlock: latestBlock,
            });

            setCachedBlock(pair!, latestBlock);
            if (logs.length === 0) return;

            const trades = formatTrades(
              logs,
              { address: tokenA, decimals: Number.isFinite(decimalsA) ? decimalsA : 6 },
              { address: tokenB, decimals: Number.isFinite(decimalsB) ? decimalsB : 6 }
            );

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(trades)}\n\n`));
            markRpcSuccess(url, Date.now() - start);
            return;
          } catch (error) {
            markRpcFailure(url);
            lastError = error;
          }
        }
        const message = lastError instanceof Error ? lastError.message : 'stream_failed';
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
      };

      await send();
      interval = setInterval(send, 4000);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
