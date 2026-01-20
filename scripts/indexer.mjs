import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { tempoModerato } from 'viem/chains';

const DEX_ADDRESS = '0xdec0000000000000000000000000000000000000';
const DEFAULT_RPCS = tempoModerato.rpcUrls.default.http;
const RPC_ENV =
  process.env.CONDUIT_TEMPO_RPC_URL ||
  process.env.NEXT_PUBLIC_CONDUIT_TEMPO_RPC_URL ||
  process.env.TEMPO_RPC_URLS ||
  process.env.TEMPO_RPC_URL ||
  process.env.NEXT_PUBLIC_TEMPO_RPC_URL ||
  DEFAULT_RPCS[0];
const RPC_URLS = RPC_ENV
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const CHAIN_ID = Number(process.env.INDEXER_CHAIN_ID ?? '42431');
const TOKEN = process.env.INDEXER_TOKEN;
const TOKEN_LIST = process.env.INDEXER_TOKEN_LIST;
const DEPTH = Number(process.env.INDEXER_DEPTH ?? '20');
const OUTPUT = process.env.INDEXER_OUTPUT ?? 'data/indexer.json';
const ANALYTICS_OUTPUT = process.env.INDEXER_ANALYTICS_OUTPUT ?? 'data/analytics.json';
const STATE_OUTPUT = process.env.INDEXER_STATE ?? 'data/indexer-state.json';
const INTERVAL_MS = Number(process.env.INDEXER_INTERVAL_MS ?? '5000');
const MAX_RANGE = BigInt(process.env.INDEXER_MAX_RANGE ?? '100000');

const createClient = (url) =>
  createPublicClient({
    chain: tempoModerato,
    transport: http(url, { timeout: 8000 }),
  });

const clients = RPC_URLS.map(createClient);

const getHealthyClient = async () => {
  let lastError;
  for (const client of clients) {
    try {
      await client.getBlockNumber();
      return client;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No healthy RPC available');
};

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
};

const loadTokensFromConfig = () => {
  const configPath = path.join(process.cwd(), 'src', 'config', 'tokens.ts');
  const content = fs.readFileSync(configPath, 'utf-8');
  const chainBlockRegex = new RegExp(`\\[${CHAIN_ID}\\]:\\s*\\[(.*?)\\]\\s*`, 's');
  const blockMatch = content.match(chainBlockRegex);
  if (!blockMatch) return [];
  const block = blockMatch[1];
  const tokenRegex = /{[^}]*symbol:\s*["']([^"']+)["'][^}]*address:\s*["'](0x[a-fA-F0-9]{40})["'][^}]*decimals:\s*(\d+)/g;
  const tokens = [];
  for (const match of block.matchAll(tokenRegex)) {
    tokens.push({ symbol: match[1], address: match[2], decimals: Number(match[3]) });
  }
  return tokens;
};

const resolveTokens = () => {
  if (TOKEN && /^0x[a-fA-F0-9]{40}$/.test(TOKEN)) {
    return [{ symbol: 'TOKEN', address: TOKEN, decimals: 6 }];
  }
  if (TOKEN_LIST) {
    return TOKEN_LIST.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => /^0x[a-fA-F0-9]{40}$/.test(entry))
      .map((address) => ({ symbol: 'TOKEN', address, decimals: 6 }));
  }
  return loadTokensFromConfig();
};

const loadState = () => {
  if (!fs.existsSync(STATE_OUTPUT)) {
    return { lastPlacedBlockByToken: {}, lastFilledBlock: null, orderMeta: {}, analytics: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_OUTPUT, 'utf-8'));
  } catch {
    return { lastPlacedBlockByToken: {}, lastFilledBlock: null, orderMeta: {}, analytics: {} };
  }
};

const saveState = (state) => {
  ensureDir(STATE_OUTPUT);
  fs.writeFileSync(STATE_OUTPUT, JSON.stringify(state, null, 2));
};

const fetchOrderbookSnapshot = async (client, token) => {
  const latestBlock = await client.getBlockNumber();
  const toBlock = latestBlock;
  const fromBlock = latestBlock > (MAX_RANGE - 1n) ? latestBlock - (MAX_RANGE - 1n) : 0n;

  const placedLogs = await client.getLogs({
    address: DEX_ADDRESS,
    event: parseAbiItem('event OrderPlaced(uint256 indexed orderId, int24 tick, bool isBid, uint256 amount, address maker, address indexed token, bool isFlipOrder, int24 flipTick)'),
    args: { token: token.address },
    fromBlock,
    toBlock,
  });

  const orderIds = placedLogs.map((log) => log.args.orderId);
  if (orderIds.length === 0) {
    return { bids: [], asks: [], recentTrades: [], cancelledOrders: [] };
  }

  const filledLogs = await client.getLogs({
    address: DEX_ADDRESS,
    event: parseAbiItem('event OrderFilled(uint256 indexed orderId, uint256 amountFilled, bool partialFill)'),
    args: { orderId: orderIds },
    fromBlock,
    toBlock,
  });

  const cancelledLogs = await client.getLogs({
    address: DEX_ADDRESS,
    event: parseAbiItem('event OrderCancelled(uint256 indexed orderId)'),
    args: { orderId: orderIds },
    fromBlock,
    toBlock,
  });

  const orders = new Map();
  const placedDetails = new Map();

  for (const log of placedLogs) {
    const { orderId, tick, isBid, amount } = log.args;
    orders.set(orderId.toString(), { tick, amount, isBid });
    placedDetails.set(orderId.toString(), { tick, isBid });
  }

  const recentTrades = [];
  for (const log of filledLogs) {
    const { orderId, amountFilled } = log.args;
    const details = placedDetails.get(orderId.toString());

    const order = orders.get(orderId.toString());
    if (order) {
      order.amount -= amountFilled;
    }

    if (details) {
      recentTrades.push({
        price: details.tick,
        amount: amountFilled,
        side: details.isBid ? 'sell' : 'buy',
        hash: log.transactionHash,
        block: log.blockNumber,
      });
    }
  }

  recentTrades.sort((a, b) => Number(b.block) - Number(a.block));

  const cancelledOrders = [];
  for (const log of cancelledLogs) {
    const { orderId } = log.args;
    const order = orders.get(orderId.toString());
    orders.delete(orderId.toString());

    const details = placedDetails.get(orderId.toString());
    if (details) {
      cancelledOrders.push({
        orderId: orderId.toString(),
        price: details.tick,
        amount: order?.amount ?? 0n,
        isBid: details.isBid,
        hash: log.transactionHash,
        block: log.blockNumber,
      });
    }
  }
  cancelledOrders.sort((a, b) => Number(b.block) - Number(a.block));

  const bidsMap = new Map();
  const asksMap = new Map();

  orders.forEach((order) => {
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
    .slice(0, DEPTH);

  const asks = Array.from(asksMap.entries())
    .map(([tick, amount]) => ({ tick, amount }))
    .sort((a, b) => a.tick - b.tick)
    .slice(0, DEPTH);

  return {
    bids,
    asks,
    recentTrades: recentTrades.slice(0, 50),
    cancelledOrders: cancelledOrders.slice(0, 50),
  };
};

const getBucketKeys = (timestamp) => {
  const date = new Date(Number(timestamp) * 1000);
  const dayKey = date.toISOString().slice(0, 10);
  const hourKey = `${dayKey}T${date.getUTCHours().toString().padStart(2, '0')}:00Z`;
  return { dayKey, hourKey };
};

const writeSnapshot = async () => {
  const tokens = resolveTokens();
  if (tokens.length === 0) {
    console.error('No tokens resolved for indexing.');
    process.exit(1);
  }

  const client = await getHealthyClient();
  const state = loadState();
  const orderMeta = state.orderMeta ?? {};
  const analytics = state.analytics ?? {};
  const lastPlacedBlockByToken = state.lastPlacedBlockByToken ?? {};
  let lastFilledBlock = state.lastFilledBlock ? BigInt(state.lastFilledBlock) : null;

  const latestBlock = await client.getBlockNumber();
  const fromFilled = lastFilledBlock !== null
    ? lastFilledBlock + 1n
    : latestBlock > (MAX_RANGE - 1n)
      ? latestBlock - (MAX_RANGE - 1n)
      : 0n;

  for (const token of tokens) {
    const fromPlaced = lastPlacedBlockByToken[token.address]
      ? BigInt(lastPlacedBlockByToken[token.address]) + 1n
      : latestBlock > (MAX_RANGE - 1n)
        ? latestBlock - (MAX_RANGE - 1n)
        : 0n;

    const placedLogs = await client.getLogs({
      address: DEX_ADDRESS,
      event: parseAbiItem('event OrderPlaced(uint256 indexed orderId, int24 tick, bool isBid, uint256 amount, address maker, address indexed token, bool isFlipOrder, int24 flipTick)'),
      args: { token: token.address },
      fromBlock: fromPlaced,
      toBlock: latestBlock,
    });

    for (const log of placedLogs) {
      const { orderId, tick, isBid } = log.args;
      orderMeta[orderId.toString()] = { token: token.address, tick, isBid };
    }

    lastPlacedBlockByToken[token.address] = latestBlock.toString();
  }

  const filledLogs = await client.getLogs({
    address: DEX_ADDRESS,
    event: parseAbiItem('event OrderFilled(uint256 indexed orderId, uint256 amountFilled, bool partialFill)'),
    fromBlock: fromFilled,
    toBlock: latestBlock,
  });

  const blockCache = new Map();
  const getBlockTimestamp = async (blockNumber) => {
    if (blockCache.has(blockNumber.toString())) {
      return blockCache.get(blockNumber.toString());
    }
    const block = await client.getBlock({ blockNumber });
    blockCache.set(blockNumber.toString(), block.timestamp);
    return block.timestamp;
  };

  for (const log of filledLogs) {
    const { orderId, amountFilled } = log.args;
    const meta = orderMeta[orderId.toString()];
    if (!meta) continue;

    const token = meta.token;
    const ts = await getBlockTimestamp(log.blockNumber);
    const { dayKey, hourKey } = getBucketKeys(ts);

    if (!analytics[token]) {
      analytics[token] = { hourly: {}, daily: {}, recentTrades: [] };
    }

    const hourly = analytics[token].hourly;
    const daily = analytics[token].daily;

    if (!hourly[hourKey]) {
      hourly[hourKey] = { volume: '0', count: 0 };
    }
    if (!daily[dayKey]) {
      daily[dayKey] = { volume: '0', count: 0 };
    }

    const volume = BigInt(hourly[hourKey].volume) + amountFilled;
    hourly[hourKey].volume = volume.toString();
    hourly[hourKey].count += 1;

    const dayVolume = BigInt(daily[dayKey].volume) + amountFilled;
    daily[dayKey].volume = dayVolume.toString();
    daily[dayKey].count += 1;

    analytics[token].recentTrades.unshift({
      price: meta.tick,
      amount: amountFilled,
      side: meta.isBid ? 'sell' : 'buy',
      hash: log.transactionHash,
      block: log.blockNumber,
      timestamp: ts.toString(),
    });
    analytics[token].recentTrades = analytics[token].recentTrades.slice(0, 50);
  }

  lastFilledBlock = latestBlock;

  const snapshots = {};
  for (const token of tokens) {
    snapshots[token.address] = await fetchOrderbookSnapshot(client, token);
  }

  ensureDir(OUTPUT);
  fs.writeFileSync(OUTPUT, JSON.stringify({ chainId: CHAIN_ID, updatedAt: Date.now(), tokens: snapshots }, null, 2));

  ensureDir(ANALYTICS_OUTPUT);
  fs.writeFileSync(ANALYTICS_OUTPUT, JSON.stringify({ chainId: CHAIN_ID, updatedAt: Date.now(), analytics }, null, 2));

  saveState({
    lastPlacedBlockByToken,
    lastFilledBlock: lastFilledBlock.toString(),
    orderMeta,
    analytics,
  });

  process.stdout.write(`[indexer] updated ${OUTPUT} and ${ANALYTICS_OUTPUT}\n`);
};

await writeSnapshot();
if (INTERVAL_MS > 0) {
  setInterval(writeSnapshot, INTERVAL_MS);
}
