import { NextResponse } from 'next/server';
import { createPublicClient, decodeFunctionData, defineChain, http, parseAbi, parseAbiItem, type Chain } from 'viem';
import { tempoModerato } from 'viem/chains';
import { getArcTestnetRpcUrls, getTempoRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getContractAddresses, ZERO_ADDRESS, isArcChain, isTempoNativeChain } from '@/config/contracts';

const DEFAULT_CHAIN_ID = 5042002;

type TxItem = {
  hash: string;
  block: bigint;
  type: string;
  status: string;
  amount: string;
  functionName?: string;
  timestamp?: number;
};

type ResponsePayload = {
  items: Array<Omit<TxItem, 'block'> & { block: string }>;
  total: number;
  hasMore: boolean;
  nextToBlock: string | null;
  scannedRange: { from: string; to: string } | null;
  latestBlock: string | null;
  timedOut: boolean;
  networkLabel: string;
  activityMode: 'tempo' | 'arc' | 'unsupported';
  supportsOrders: boolean;
  notice: string | null;
};

type ChainContext = {
  chain: Chain;
  rpcUrls: string[];
  dexAddress: `0x${string}`;
  abi: ReturnType<typeof parseAbi>;
  networkLabel: string;
  activityMode: ResponsePayload['activityMode'];
  supportsOrders: boolean;
  notice: string | null;
};

const BLOCKS_PER_PAGE = 2000n;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000' as const;

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

type CachedResponse = { ts: number; payload: ResponsePayload };
const globalCache = globalThis as typeof globalThis & { __txCache?: Map<string, CachedResponse> };
const txCache = globalCache.__txCache ?? new Map<string, CachedResponse>();
globalCache.__txCache = txCache;
const CACHE_TTL_MS = 10_000;

const TEMPO_DEX_ABI = parseAbi([
  'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external returns (uint128 amountOut)',
  'function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)',
  'function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)',
  'function addLiquidity(address userToken, address validatorToken, uint128 amount) external',
  'function removeLiquidity(address userToken, address validatorToken, uint256 liquidityAmount) external',
  'function withdraw(address token, uint128 amount) external',
  'function cancel(uint128 orderId) external',
]);

const HUB_AMM_ACTIVITY_ABI = parseAbi([
  'function addLiquidity(address userToken, address validatorToken, uint256 amount, uint256 deadline) external returns (uint256 mintedShares)',
  'function removeLiquidity(address userToken, address validatorToken, uint256 shareAmount, uint256 minUserOut, uint256 minPathOut, uint256 deadline) external returns (uint256 userOut, uint256 pathOut)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)',
  'function pause() external',
  'function unpause() external',
]);

const ARC_LIQUIDITY_ADDED_EVENT = parseAbiItem(
  'event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)'
);
const ARC_LIQUIDITY_REMOVED_EVENT = parseAbiItem(
  'event LiquidityRemoved(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)'
);
const ARC_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'
);

const isValidAddress = (value: string | null) => !!value && /^0x[a-fA-F0-9]{40}$/.test(value);

const createClient = (chain: Chain, url: string, timeout = 15_000) =>
  createPublicClient({
    chain,
    transport: http(url, { timeout }),
  });

function getChainContext(chainId: number): ChainContext | null {
  if (isTempoNativeChain(chainId)) {
    return {
      chain: tempoModerato,
      rpcUrls: getTempoRpcUrls(),
      dexAddress: TEMPO_DEX_ADDRESS,
      abi: TEMPO_DEX_ABI,
      networkLabel: 'Tempo Testnet',
      activityMode: 'tempo',
      supportsOrders: true,
      notice: null,
    };
  }

  if (isArcChain(chainId)) {
    const dexAddress = getContractAddresses(chainId).HUB_AMM_ADDRESS;
    const deployed = dexAddress !== ZERO_ADDRESS;

    return {
      chain: ARC_TESTNET,
      rpcUrls: getArcTestnetRpcUrls(),
      dexAddress,
      abi: HUB_AMM_ACTIVITY_ABI,
      networkLabel: 'Arc Testnet',
      activityMode: 'arc',
      supportsOrders: false,
      notice: deployed
        ? 'Arc activity focuses on swaps and liquidity actions around the deployed hub AMM.'
        : 'Arc activity preview is enabled, but no Arc hub AMM deployment is configured in this environment yet.',
    };
  }

  return null;
}

async function withFallback<T>(
  context: ChainContext,
  fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (const url of context.rpcUrls) {
    try {
      return await fn(createClient(context.chain, url));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('All RPC endpoints failed');
}

function decodeTempoTransaction(input: `0x${string}`) {
  try {
    const decoded = decodeFunctionData({ abi: TEMPO_DEX_ABI, data: input });
    const functionName = decoded.functionName;

    switch (functionName) {
      case 'swapExactAmountIn':
        return { type: 'Swap', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'place':
        return { type: 'Order Placed', amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'placeFlip':
        return { type: 'Order Placed (Flip)', amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'addLiquidity':
        return { type: 'Add Liquidity', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'removeLiquidity':
        return { type: 'Remove Liquidity', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'withdraw':
        return { type: 'Withdraw', amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'cancel':
        return { type: 'Order Cancelled', amount: '0', functionName };
      default:
        return { type: 'DEX Call', amount: '0', functionName };
    }
  } catch {
    return { type: 'DEX Call', amount: '0', functionName: 'unknown' };
  }
}

function decodeArcTransaction(input: `0x${string}`) {
  try {
    const decoded = decodeFunctionData({ abi: HUB_AMM_ACTIVITY_ABI, data: input });
    const functionName = decoded.functionName;

    switch (functionName) {
      case 'swap':
        return { type: 'Swap', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'addLiquidity':
        return { type: 'Add Liquidity', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'removeLiquidity':
        return { type: 'Remove Liquidity', amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0', functionName };
      case 'pause':
        return { type: 'Protocol Pause', amount: '0', functionName };
      case 'unpause':
        return { type: 'Protocol Resume', amount: '0', functionName };
      default:
        return { type: 'AMM Call', amount: '0', functionName };
    }
  } catch {
    return { type: 'AMM Call', amount: '0', functionName: 'unknown' };
  }
}

function decodeTransaction(context: ChainContext, input: `0x${string}`) {
  return context.activityMode === 'tempo' ? decodeTempoTransaction(input) : decodeArcTransaction(input);
}

function buildEmptyPayload(context: ChainContext, notice = context.notice): ResponsePayload {
  return {
    items: [],
    total: 0,
    hasMore: false,
    nextToBlock: null,
    scannedRange: null,
    latestBlock: null,
    timedOut: false,
    networkLabel: context.networkLabel,
    activityMode: context.activityMode,
    supportsOrders: context.supportsOrders,
    notice,
  };
}

async function buildResponse(
  client: ReturnType<typeof createClient>,
  context: ChainContext,
  address: string,
  limit: number,
  requestedToBlock?: bigint
): Promise<ResponsePayload> {
  if (context.dexAddress === ZERO_ADDRESS) {
    return buildEmptyPayload(context);
  }

  if (context.activityMode === 'arc') {
    return buildArcResponse(client, context, address, limit, requestedToBlock);
  }

  const latestBlock = await client.getBlockNumber();
  const toBlock = requestedToBlock !== undefined && requestedToBlock <= latestBlock ? requestedToBlock : latestBlock;
  const fromBlock = toBlock > BLOCKS_PER_PAGE ? toBlock - BLOCKS_PER_PAGE : 0n;
  const deadline = Date.now() + 8_500;

  const items: TxItem[] = [];
  const dexAddress = context.dexAddress.toLowerCase();
  const fromAddress = address.toLowerCase();

  const batchSize = 50n;
  let timedOut = false;
  let lastScannedBlock = toBlock;

  for (let end = toBlock; end >= fromBlock && items.length < limit; end -= batchSize) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }

    const start = end >= (batchSize - 1n) ? end - (batchSize - 1n) : 0n;
    const actualStart = start < fromBlock ? fromBlock : start;
    if (actualStart > end) break;

    const blockNumbers: bigint[] = [];
    for (let b = end; b >= actualStart; b -= 1n) {
      blockNumbers.push(b);
    }

    try {
      const blockResults = await Promise.allSettled(
        blockNumbers.map((blockNumber) => client.getBlock({ blockNumber, includeTransactions: true }))
      );

      const successfulBlocks = blockResults
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof client.getBlock>>> => result.status === 'fulfilled')
        .map((result) => result.value);

      for (const block of successfulBlocks) {
        if (items.length >= limit) break;

        for (const tx of block.transactions) {
          if (items.length >= limit) break;
          if (!tx.to) continue;
          if (tx.to.toLowerCase() !== dexAddress) continue;
          if (tx.from?.toLowerCase() !== fromAddress) continue;

          const decoded = decodeTransaction(context, tx.input);
          items.push({
            hash: tx.hash,
            block: tx.blockNumber ?? block.number,
            type: decoded.type,
            status: 'Pending',
            amount: decoded.amount,
            functionName: decoded.functionName,
            timestamp: Number(block.timestamp),
          });
        }
      }

      lastScannedBlock = actualStart;
    } catch (batchError) {
      console.error('Batch fetch error:', batchError);
    }

    if (actualStart === 0n) break;
  }

  if (items.length > 0) {
    const receiptResults = await Promise.allSettled(
      items.map((item) => client.getTransactionReceipt({ hash: item.hash as `0x${string}` }))
    );

    receiptResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        items[index].status = result.value.status === 'success' ? 'Confirmed' : 'Failed';
      } else {
        items[index].status = 'Unknown';
      }
    });
  }

  const nextToBlock = lastScannedBlock > 0n ? lastScannedBlock - 1n : null;

  return {
    items: items.map((item) => ({
      ...item,
      block: item.block.toString(),
    })),
    total: items.length,
    hasMore: nextToBlock !== null,
    nextToBlock: nextToBlock?.toString() ?? null,
    scannedRange: {
      from: fromBlock.toString(),
      to: toBlock.toString(),
    },
    latestBlock: latestBlock.toString(),
    timedOut,
    networkLabel: context.networkLabel,
    activityMode: context.activityMode,
    supportsOrders: context.supportsOrders,
    notice: context.notice,
  };
}

async function buildArcResponse(
  client: ReturnType<typeof createClient>,
  context: ChainContext,
  address: string,
  limit: number,
  requestedToBlock?: bigint
): Promise<ResponsePayload> {
  const latestBlock = await client.getBlockNumber();
  const toBlock = requestedToBlock !== undefined && requestedToBlock <= latestBlock ? requestedToBlock : latestBlock;
  const fromBlock = toBlock > BLOCKS_PER_PAGE ? toBlock - BLOCKS_PER_PAGE : 0n;

  const account = address as `0x${string}`;
  const dexAddress = context.dexAddress;

  const [swapLogs, addLogs, removeLogs] = await Promise.all([
    client.getLogs({
      address: dexAddress,
      event: ARC_SWAP_EVENT,
      args: { user: account },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: dexAddress,
      event: ARC_LIQUIDITY_ADDED_EVENT,
      args: { provider: account },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: dexAddress,
      event: ARC_LIQUIDITY_REMOVED_EVENT,
      args: { provider: account },
      fromBlock,
      toBlock,
    }),
  ]);

  const items: TxItem[] = [
    ...swapLogs.map((log) => ({
      hash: log.transactionHash,
      block: log.blockNumber,
      type: 'Swap',
      status: 'Confirmed',
      amount: (log.args.amountIn ?? 0n).toString(),
      functionName: 'swap',
    })),
    ...addLogs.map((log) => ({
      hash: log.transactionHash,
      block: log.blockNumber,
      type: 'Add Liquidity',
      status: 'Confirmed',
      amount: (log.args.tokenAmount ?? 0n).toString(),
      functionName: 'addLiquidity',
    })),
    ...removeLogs.map((log) => ({
      hash: log.transactionHash,
      block: log.blockNumber,
      type: 'Remove Liquidity',
      status: 'Confirmed',
      amount: (log.args.tokenAmount ?? 0n).toString(),
      functionName: 'removeLiquidity',
    })),
  ]
    .sort((a, b) => Number(b.block - a.block))
    .slice(0, limit);

  const uniqueBlocks = Array.from(new Set(items.map((item) => item.block.toString())));
  const blockTimestamps = new Map<string, number>();
  await Promise.all(
    uniqueBlocks.map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
      blockTimestamps.set(blockNumber, Number(block.timestamp));
    })
  );

  const nextToBlock = fromBlock > 0n ? fromBlock - 1n : null;

  return {
    items: items.map((item) => ({
      ...item,
      block: item.block.toString(),
      timestamp: blockTimestamps.get(item.block.toString()),
    })),
    total: items.length,
    hasMore: nextToBlock !== null,
    nextToBlock: nextToBlock?.toString() ?? null,
    scannedRange: {
      from: fromBlock.toString(),
      to: toBlock.toString(),
    },
    latestBlock: latestBlock.toString(),
    timedOut: false,
    networkLabel: context.networkLabel,
    activityMode: context.activityMode,
    supportsOrders: context.supportsOrders,
    notice: context.notice,
  };
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`transactions:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const chainIdParam = searchParams.get('chainId');
  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : DEFAULT_CHAIN_ID;
  const limitParam = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const toBlockParam = searchParams.get('toBlock');
  const toBlock = toBlockParam ? BigInt(toBlockParam) : undefined;

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const context = getChainContext(chainId);
  if (!context) {
    return NextResponse.json(
      {
        ...buildEmptyPayload({
          chain: tempoModerato,
          rpcUrls: [],
          dexAddress: ZERO_ADDRESS,
          abi: TEMPO_DEX_ABI,
          networkLabel: 'Unsupported Network',
          activityMode: 'unsupported',
          supportsOrders: false,
          notice: 'Transaction activity is only configured for Tempo and Arc testnets in this app.',
        }),
      },
      { status: 200 }
    );
  }

  try {
    const cacheKey = `${address!.toLowerCase()}:${chainId}:${limit}`;
    if (toBlock === undefined) {
      const cached = txCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return NextResponse.json(cached.payload, {
          headers: {
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
          },
        });
      }
    }

    const data = await withFallback(context, async (client) => {
      return buildResponse(client, context, address!, limit, toBlock);
    });

    if (toBlock === undefined) {
      txCache.set(cacheKey, { ts: Date.now(), payload: data });
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Transactions API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load transactions';
    return NextResponse.json(
      {
        ...buildEmptyPayload(context, context.notice),
        error: message,
      },
      { status: 200 }
    );
  }
}
