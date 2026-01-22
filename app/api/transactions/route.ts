import { NextResponse } from 'next/server';
import { createPublicClient, decodeFunctionData, http, parseAbi } from 'viem';
import { tempoModerato } from 'viem/chains';
import { getTempoRpcUrls } from '@/lib/rpc';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

type TxItem = {
  hash: string;
  block: bigint;
  type: string;
  status: string;
  amount: string;
  functionName?: string;
};

const MAX_SCAN_BLOCKS = BigInt(
  Math.max(1, Number.parseInt(process.env.TX_SCAN_MAX_BLOCKS ?? '50000', 10) || 50000)
);
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000' as const;

const DEX_ABI = parseAbi([
  'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external returns (uint128 amountOut)',
  'function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)',
  'function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)',
  'function addLiquidity(address userToken, address validatorToken, uint128 amount) external',
  'function removeLiquidity(address userToken, address validatorToken, uint256 liquidityAmount) external',
  'function withdraw(address token, uint128 amount) external',
  'function cancel(uint128 orderId) external',
]);

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
  const limitParam = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (chainId !== tempoModerato.id) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }

  try {
    const data = await withFallback(async (client) => {
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > (MAX_SCAN_BLOCKS - 1n) ? latestBlock - (MAX_SCAN_BLOCKS - 1n) : 0n;

      const items: TxItem[] = [];
      const dexAddress = TEMPO_DEX_ADDRESS.toLowerCase();
      const fromAddress = address!.toLowerCase();
      const batchSize = 10n;

      for (let start = latestBlock; start >= fromBlock && items.length < limit; start -= batchSize) {
        const end = start;
        const begin = start >= (batchSize - 1n) ? start - (batchSize - 1n) : 0n;
        const blocks: bigint[] = [];
        for (let b = end; b >= begin; b -= 1n) {
          blocks.push(b);
        }

        const blockData = await Promise.all(
          blocks.map((blockNumber) =>
            client.getBlock({ blockNumber, includeTransactions: true })
          )
        );

        for (const block of blockData) {
          for (const tx of block.transactions) {
            if (!tx.to) continue;
            if (tx.to.toLowerCase() !== dexAddress) continue;
            if (tx.from?.toLowerCase() !== fromAddress) continue;

            let functionName = 'unknown';
            let type = 'DEX Call';
            let amount = '0';

            try {
              const decoded = decodeFunctionData({ abi: DEX_ABI, data: tx.input });
              functionName = decoded.functionName;
              switch (decoded.functionName) {
                case 'swapExactAmountIn':
                  type = 'Swap';
                  amount = (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'place':
                  type = 'Order Placed';
                  amount = (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'placeFlip':
                  type = 'Order Placed (Flip)';
                  amount = (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'addLiquidity':
                  type = 'Add Liquidity';
                  amount = (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'removeLiquidity':
                  type = 'Remove Liquidity';
                  amount = (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'withdraw':
                  type = 'Withdraw';
                  amount = (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0';
                  break;
                case 'cancel':
                  type = 'Order Cancelled';
                  amount = '0';
                  break;
                default:
                  type = 'DEX Call';
              }
            } catch {
              // Leave as generic DEX Call if we cannot decode input.
            }

            items.push({
              hash: tx.hash,
              block: tx.blockNumber ?? block.number,
              type,
              status: 'Pending',
              amount,
              functionName,
            });
            if (items.length >= limit) break;
          }
          if (items.length >= limit) break;
        }

        if (begin === 0n) break;
      }

      const receipts = await Promise.all(
        items.map((item) => client.getTransactionReceipt({ hash: item.hash }))
      );
      receipts.forEach((receipt, index) => {
        items[index].status = receipt.status === 'success' ? 'Confirmed' : 'Failed';
      });

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
