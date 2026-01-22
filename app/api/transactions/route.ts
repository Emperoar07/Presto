import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { tempoModerato } from 'viem/chains';
import { getTempoRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

type TxItem = {
  hash: string;
  block: bigint;
  type: 'Order Placed' | 'Order Filled' | 'Order Cancelled';
  status: string;
  amount: string;
  token?: string;
  isBid?: boolean;
  tick?: number;
};

const MAX_RANGE = 100000n;
const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000' as const;

const ORDER_PLACED_EVENT = parseAbiItem(
  'event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)'
);
const ORDER_FILLED_EVENT = parseAbiItem(
  'event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)'
);
const ORDER_CANCELLED_EVENT = parseAbiItem('event OrderCancelled(uint128 indexed orderId)');

const isValidAddress = (value: string | null) => !!value && /^0x[a-fA-F0-9]{40}$/.test(value);

const createClient = (url: string) =>
  createPublicClient({
    chain: tempoModerato,
    transport: http(url, { timeout: 8000 }),
  });

async function withFallback<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const urls = getTempoRpcUrls();
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fn(createClient(url));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('RPC read failed');
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
  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : tempoModerato.id;

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (chainId !== tempoModerato.id) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }

  try {
    const data = await withFallback(async (client) => {
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > (MAX_RANGE - 1n) ? latestBlock - (MAX_RANGE - 1n) : 0n;
      const toBlock = latestBlock;

      const placedLogs = await client.getLogs({
        address: TEMPO_DEX_ADDRESS,
        event: ORDER_PLACED_EVENT,
        args: { maker: address as `0x${string}` },
        fromBlock,
        toBlock,
      });

      const orderDetails = new Map<string, { token: string; isBid: boolean; tick: number; amount: bigint }>();
      const placedItems: TxItem[] = placedLogs.map((log) => {
        const { orderId, token, amount, isBid, tick } = log.args;
        const id = orderId?.toString() ?? '';
        if (orderId && token && amount !== undefined && isBid !== undefined && tick !== undefined) {
          orderDetails.set(id, { token, isBid, tick: Number(tick), amount });
        }
        return {
          hash: log.transactionHash,
          block: log.blockNumber,
          type: 'Order Placed',
          status: 'Confirmed',
          amount: amount?.toString() ?? '0',
          token,
          isBid,
          tick: tick ? Number(tick) : undefined,
        };
      });

      const orderIds = Array.from(orderDetails.keys()).map((id) => BigInt(id));
      let filledItems: TxItem[] = [];
      let cancelledItems: TxItem[] = [];

      if (orderIds.length > 0) {
        const filledLogs = await client.getLogs({
          address: TEMPO_DEX_ADDRESS,
          event: ORDER_FILLED_EVENT,
          args: { orderId: orderIds },
          fromBlock,
          toBlock,
        });

        filledItems = filledLogs.map((log) => {
          const { orderId, amountFilled, partialFill } = log.args;
          const details = orderId ? orderDetails.get(orderId.toString()) : undefined;
          return {
            hash: log.transactionHash,
            block: log.blockNumber,
            type: 'Order Filled',
            status: partialFill ? 'Partial' : 'Filled',
            amount: amountFilled?.toString() ?? '0',
            token: details?.token,
            isBid: details?.isBid,
            tick: details?.tick,
          };
        });

        const cancelledLogs = await client.getLogs({
          address: TEMPO_DEX_ADDRESS,
          event: ORDER_CANCELLED_EVENT,
          args: { orderId: orderIds },
          fromBlock,
          toBlock,
        });

        cancelledItems = cancelledLogs.map((log) => {
          const { orderId } = log.args;
          const details = orderId ? orderDetails.get(orderId.toString()) : undefined;
          return {
            hash: log.transactionHash,
            block: log.blockNumber,
            type: 'Order Cancelled',
            status: 'Cancelled',
            amount: details?.amount?.toString() ?? '0',
            token: details?.token,
            isBid: details?.isBid,
            tick: details?.tick,
          };
        });
      }

      const items = [...placedItems, ...filledItems, ...cancelledItems].sort(
        (a, b) => Number(b.block - a.block)
      );
      return {
        items: items.map((item) => ({
          ...item,
          block: item.block.toString(),
        })),
      };
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load transactions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
