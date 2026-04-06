import { createPublicClient, http, type PublicClient } from 'viem';
import { tempoModerato } from 'viem/chains';

const splitUrls = (value: string) =>
  value
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

// Quote cache for faster responses - longer TTL for stablecoins
type QuoteCacheEntry = { result: bigint; timestamp: number };
const quoteCache = new Map<string, QuoteCacheEntry>();
const QUOTE_CACHE_TTL_MS = 20_000; // 20s — stablecoin prices are stable; avoids redundant RPC calls

// RPC performance tracking
type RpcStats = { avgMs: number; samples: number; failures: number; lastFailure: number };
const rpcStats = new Map<string, RpcStats>();

const updateRpcStats = (url: string, durationMs: number, success: boolean) => {
  const stats = rpcStats.get(url) || { avgMs: 0, samples: 0, failures: 0, lastFailure: 0 };
  if (success) {
    const newSamples = Math.min(stats.samples + 1, 10); // Cap at 10 samples for rolling average
    stats.avgMs = (stats.avgMs * stats.samples + durationMs) / newSamples;
    stats.samples = newSamples;
  } else {
    stats.failures++;
    stats.lastFailure = Date.now();
  }
  rpcStats.set(url, stats);
};

const sortClientsByPerformance = (clients: { url: string; client: PublicClient }[]) => {
  const now = Date.now();
  return [...clients].sort((a, b) => {
    const aStats = rpcStats.get(a.url);
    const bStats = rpcStats.get(b.url);
    // Penalize recently failed RPCs
    const aFailed = aStats && now - aStats.lastFailure < 30000;
    const bFailed = bStats && now - bStats.lastFailure < 30000;
    if (aFailed && !bFailed) return 1;
    if (!aFailed && bFailed) return -1;
    // Sort by average response time
    const aAvg = aStats?.avgMs ?? Infinity;
    const bAvg = bStats?.avgMs ?? Infinity;
    return aAvg - bAvg;
  });
};

export const getTempoRpcUrls = () => {
  const conduit = process.env.CONDUIT_TEMPO_RPC_URL || process.env.NEXT_PUBLIC_CONDUIT_TEMPO_RPC_URL;
  const explicit = process.env.TEMPO_RPC_URLS || process.env.TEMPO_RPC_URL || process.env.NEXT_PUBLIC_TEMPO_RPC_URL;
  if (conduit) return splitUrls(conduit);
  if (explicit) return splitUrls(explicit);
  return tempoModerato.rpcUrls.default.http;
};

export const getBaseSepoliaRpcUrls = () => {
  const explicit = process.env.BASE_SEPOLIA_RPC_URLS || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  if (explicit) return splitUrls(explicit);
  return [];
};

export const ARC_TESTNET_RPC_DEFAULTS = [
  'https://rpc.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
];

export const getArcTestnetRpcUrls = () => {
  const explicit = process.env.ARC_TESTNET_RPC_URLS || process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL;
  if (explicit) return splitUrls(explicit);
  return ARC_TESTNET_RPC_DEFAULTS;
};

let tempoClients: { url: string; client: PublicClient }[] | null = null;

export const getTempoPublicClients = () => {
  if (tempoClients) return tempoClients;
  const urls = getTempoRpcUrls();
  tempoClients = urls.map((url) => ({
    url,
    client: createPublicClient({
      chain: tempoModerato,
      transport: http(url, { timeout: 8000 }),
    }),
  }));
  return tempoClients;
};

// Legacy export for backward compatibility
export const getTempoPublicClientsList = () => getTempoPublicClients().map(c => c.client);

/**
 * Get a cache key for quote requests
 */
const stringifyArgs = (value: unknown): string => {
  const result = JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val));
  return result ?? '';
};

const getQuoteCacheKey = (params: Parameters<PublicClient['readContract']>[0]): string => {
  const { address, functionName, args } = params;
  return `${address}:${functionName}:${stringifyArgs(args)}`;
};

/**
 * Check quote cache for a valid cached result
 */
export const getCachedQuote = (params: Parameters<PublicClient['readContract']>[0]): bigint | null => {
  const key = getQuoteCacheKey(params);
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL_MS) {
    return cached.result;
  }
  return null;
};

/**
 * Race multiple RPCs in parallel and return the fastest successful result
 */
const raceRpcCalls = async <T>(
  clients: { url: string; client: PublicClient }[],
  params: Parameters<PublicClient['readContract']>[0]
): Promise<T> => {
  const sortedClients = sortClientsByPerformance(clients);

  // Start all requests in parallel
  const promises = sortedClients.map(async ({ url, client }) => {
    const start = Date.now();
    try {
      const result = await client.readContract(params);
      updateRpcStats(url, Date.now() - start, true);
      return { success: true as const, result, url };
    } catch (error) {
      updateRpcStats(url, Date.now() - start, false);
      return { success: false as const, error, url };
    }
  });

  // Use Promise.any to get the first successful result
  const results = await Promise.allSettled(promises);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      return result.value.result as T;
    }
  }

  // If all failed, throw the last error
  const lastResult = results[results.length - 1];
  if (lastResult?.status === 'fulfilled' && !lastResult.value.success) {
    throw lastResult.value.error;
  }
  throw new Error('All RPC calls failed');
};

/**
 * Read contract with caching and parallel RPC racing for optimal performance
 */
export const readContractWithFallback = async <T>(
  primary: PublicClient | null | undefined,
  params: Parameters<PublicClient['readContract']>[0],
  options?: { useCache?: boolean; raceMode?: boolean }
): Promise<T> => {
  const { useCache = true, raceMode = true } = options || {};

  // Check cache first for quote-like calls
  if (useCache && (params.functionName?.includes('quote') || params.functionName?.includes('Quote'))) {
    const cached = getCachedQuote(params);
    if (cached !== null) {
      return cached as T;
    }
  }

  const tempoClients = getTempoPublicClients();
  const allClients = primary
    ? [{ url: 'primary', client: primary }, ...tempoClients]
    : tempoClients;

  let result: T;

  if (raceMode && allClients.length > 1) {
    // Race mode: parallel requests, fastest wins
    result = await raceRpcCalls<T>(allClients, params);
  } else {
    // Sequential fallback mode
    let lastError: unknown;
    for (const { url, client } of allClients) {
      const start = Date.now();
      try {
        result = (await client.readContract(params)) as T;
        updateRpcStats(url, Date.now() - start, true);
        break;
      } catch (error) {
        updateRpcStats(url, Date.now() - start, false);
        lastError = error;
      }
    }
    if (result === undefined) {
      throw lastError ?? new Error('RPC read failed');
    }
  }

  // Cache the result for quote calls
  if (useCache && (params.functionName?.includes('quote') || params.functionName?.includes('Quote'))) {
    const key = getQuoteCacheKey(params);
    quoteCache.set(key, { result: result as bigint, timestamp: Date.now() });
  }

  return result!;
};

/**
 * Invalidate quote cache (call after a swap)
 */
export const invalidateQuoteCache = () => {
  quoteCache.clear();
};

/**
 * Get RPC performance stats for debugging
 */
export const getRpcStats = () => Object.fromEntries(rpcStats);
