import { createPublicClient, http, parseAbiItem, type PublicClient, type Chain } from 'viem';
import { tempoModerato, hardhat } from 'viem/chains';
import { getTempoRpcUrls } from '@/lib/rpc';

export type OrderbookEntry = { tick: number; amount: bigint };
export type RecentTrade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
export type CancelledOrder = { orderId: string; price: number; amount: bigint; isBid: boolean; hash: `0x${string}`; block: bigint };
export type OrderbookData = { bids: OrderbookEntry[]; asks: OrderbookEntry[]; recentTrades: RecentTrade[]; cancelledOrders: CancelledOrder[] };

type OrderbookCache = Map<string, { ts: number; data: OrderbookData }>;
type OrderbookState = {
  lastBlock: bigint;
  lastAccess: number;
  orders: Map<string, { tick: number; amount: bigint; isBid: boolean }>;
  placedDetails: Map<string, { tick: number; isBid: boolean }>;
  recentTrades: RecentTrade[];
  cancelledOrders: CancelledOrder[];
};

const globalCache = globalThis as typeof globalThis & { __orderbookCache?: OrderbookCache };
const cache = globalCache.__orderbookCache ?? new Map();
globalCache.__orderbookCache = cache;
const globalState = globalThis as typeof globalThis & { __orderbookState?: Map<string, OrderbookState> };
const stateCache = globalState.__orderbookState ?? new Map();
globalState.__orderbookState = stateCache;
const globalRpcStats = globalThis as typeof globalThis & { __orderbookRpcStats?: Map<string, { avg: number; samples: number; failures: number; disabledUntil: number }> };
const rpcStats = globalRpcStats.__orderbookRpcStats ?? new Map();
globalRpcStats.__orderbookRpcStats = rpcStats;

// Chain-specific DEX addresses
const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000' as const;
const DEFAULT_DEX_ADDRESS = '0x0816AF96DE0f19CdcC83F717E5f65aeE1373A54A' as const;

export const getDexAddress = (chainId?: number): `0x${string}` => {
  if (chainId === 42431) return TEMPO_DEX_ADDRESS;
  return DEFAULT_DEX_ADDRESS;
};

// For backward compatibility
export const DEX_ADDRESS = TEMPO_DEX_ADDRESS;

const STATE_TTL_MS = 5 * 60 * 1000;
const MAX_STATE_ENTRIES = 200;

const RPC_URLS = getTempoRpcUrls();

const getChainConfig = (chainId?: number): Chain => {
  if (chainId === 42431) return tempoModerato;
  if (chainId === 31337) return hardhat;
  return tempoModerato; // Default
};

const createClient = (url: string, chainId?: number): PublicClient =>
  createPublicClient({
    chain: getChainConfig(chainId),
    transport: http(url, { timeout: 8000 }),
  });

// Default clients for Tempo testnet
const defaultClients = RPC_URLS.map((url) => ({ url, client: createClient(url, 42431) }));

export const isValidAddress = (value: string | null) => !!value && /^0x[a-fA-F0-9]{40}$/.test(value);

const pruneStateCache = () => {
  const now = Date.now();
  for (const [key, state] of stateCache.entries()) {
    if (now - state.lastAccess > STATE_TTL_MS) {
      stateCache.delete(key);
    }
  }
  if (stateCache.size <= MAX_STATE_ENTRIES) return;
  const entries = Array.from(stateCache.entries()).sort(
    (a, b) => a[1].lastAccess - b[1].lastAccess
  );
  const overage = entries.length - MAX_STATE_ENTRIES;
  for (let i = 0; i < overage; i += 1) {
    stateCache.delete(entries[i][0]);
  }
};

const ORDER_PLACED_EVENT = parseAbiItem(
  'event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)'
);
const ORDER_FILLED_EVENT = parseAbiItem(
  'event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)'
);
const ORDER_CANCELLED_EVENT = parseAbiItem('event OrderCancelled(uint128 indexed orderId)');

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

const sortRpcClients = (clients: { url: string; client: PublicClient }[]) => {
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

const fetchOrderbookData = async (client: PublicClient, token: string, depth: number, chainId?: number): Promise<OrderbookData> => {
  pruneStateCache();
  const dexAddress = getDexAddress(chainId);
  const latestBlock = await client.getBlockNumber();
  const maxRange = 100000n;
  const toBlock = latestBlock;
  const cacheKey = `${chainId || 42431}:${token.toLowerCase()}`;
  let state = stateCache.get(cacheKey);
  const now = Date.now();

  let fromBlock: bigint;
  if (!state || latestBlock < state.lastBlock || latestBlock - state.lastBlock > maxRange) {
    fromBlock = latestBlock > (maxRange - 1n) ? latestBlock - (maxRange - 1n) : 0n;
    state = {
      lastBlock: fromBlock,
      lastAccess: now,
      orders: new Map(),
      placedDetails: new Map(),
      recentTrades: [],
      cancelledOrders: [],
    };
  } else {
    fromBlock = state.lastBlock + 1n;
    state.lastAccess = now;
  }

  const placedLogs = await client.getLogs({
    address: dexAddress,
    event: ORDER_PLACED_EVENT,
    args: { token: token as `0x${string}` },
    fromBlock,
    toBlock,
  });

  for (const log of placedLogs) {
    const { orderId, tick, isBid, amount } = log.args;
    if (orderId === undefined || tick === undefined || isBid === undefined || amount === undefined) continue;
    const orderKey = orderId.toString();
    const tickValue = Number(tick);
    state.orders.set(orderKey, { tick: tickValue, amount, isBid });
    state.placedDetails.set(orderKey, { tick: tickValue, isBid });
  }

  const orderIds = Array.from(state.orders.keys()).map((id) => BigInt(id));
  if (orderIds.length === 0) {
    state.lastBlock = toBlock;
    state.lastAccess = now;
    stateCache.set(cacheKey, state);
    return { bids: [], asks: [], recentTrades: [], cancelledOrders: [] };
  }

  const filledLogs = await client.getLogs({
    address: dexAddress,
    event: ORDER_FILLED_EVENT,
    args: { orderId: orderIds },
    fromBlock,
    toBlock,
  });

  const cancelledLogs = await client.getLogs({
    address: dexAddress,
    event: ORDER_CANCELLED_EVENT,
    args: { orderId: orderIds },
    fromBlock,
    toBlock,
  });

  for (const log of filledLogs) {
    const { orderId, amountFilled } = log.args;
    if (!orderId || amountFilled === undefined) continue;
    const orderKey = orderId.toString();
    const details = state.placedDetails.get(orderKey);

    const order = state.orders.get(orderKey);
    if (order) {
      order.amount -= amountFilled;
      if (order.amount <= 0n) {
        state.orders.delete(orderKey);
      }
    }

    if (details) {
      state.recentTrades.push({
        price: details.tick,
        amount: amountFilled,
        side: details.isBid ? 'sell' : 'buy',
        hash: log.transactionHash as `0x${string}`,
        block: log.blockNumber,
      });
    }
  }

  state.recentTrades.sort((a, b) => Number(b.block) - Number(a.block));
  state.recentTrades = state.recentTrades.slice(0, 20);

  for (const log of cancelledLogs) {
    const { orderId } = log.args;
    if (!orderId) continue;
    const orderKey = orderId.toString();
    const order = state.orders.get(orderKey);
    state.orders.delete(orderKey);

    const details = state.placedDetails.get(orderKey);
    if (details) {
      state.cancelledOrders.push({
        orderId: orderId.toString(),
        price: details.tick,
        amount: order?.amount ?? 0n,
        isBid: details.isBid,
        hash: log.transactionHash as `0x${string}`,
        block: log.blockNumber,
      });
    }
  }
  state.cancelledOrders.sort((a, b) => Number(b.block) - Number(a.block));
  state.cancelledOrders = state.cancelledOrders.slice(0, 20);

  const bidsMap = new Map<number, bigint>();
  const asksMap = new Map<number, bigint>();

  state.orders.forEach((order) => {
    if (order.amount <= 0n) return;
    if (order.isBid) {
      bidsMap.set(order.tick, (bidsMap.get(order.tick) || 0n) + order.amount);
    } else {
      asksMap.set(order.tick, (asksMap.get(order.tick) || 0n) + order.amount);
    }
  });

  const bids = Array.from(bidsMap.entries())
    .map(([tick, amount]) => ({ tick, amount }))
    .sort((a, b) => b.tick - a.tick)
    .slice(0, depth);

  const asks = Array.from(asksMap.entries())
    .map(([tick, amount]) => ({ tick, amount }))
    .sort((a, b) => a.tick - b.tick)
    .slice(0, depth);

  state.lastBlock = toBlock;
  state.lastAccess = now;
  stateCache.set(cacheKey, state);

  return {
    bids,
    asks,
    recentTrades: state.recentTrades,
    cancelledOrders: state.cancelledOrders,
  };
};

export async function getOrderbookData(token: string, depth: number, cacheTtlMs = 3000, chainId?: number): Promise<OrderbookData> {
  const cacheKey = `${chainId || 42431}:${token.toLowerCase()}:${depth}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cacheTtlMs) {
    return cached.data;
  }

  // Use chain-specific clients if available, otherwise use default Tempo clients
  const clients = chainId ? RPC_URLS.map((url) => ({ url, client: createClient(url, chainId) })) : defaultClients;
  const orderedClients = sortRpcClients(clients);

  let lastError: unknown;
  for (const { url, client } of orderedClients) {
    try {
      const start = Date.now();
      const data = await fetchOrderbookData(client, token, depth, chainId);
      markRpcSuccess(url, Date.now() - start);
      cache.set(cacheKey, { ts: Date.now(), data });
      return data;
    } catch (error) {
      markRpcFailure(url);
      lastError = error;
    }
  }

  throw lastError ?? new Error('Orderbook fetch failed');
}
