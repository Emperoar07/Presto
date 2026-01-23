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
  timestamp?: number;
};

// Scan range for collecting last N transactions. Can be overridden via env.
const MAX_SCAN_BLOCKS = BigInt(
  Math.max(1, Number.parseInt(process.env.TX_SCAN_MAX_BLOCKS ?? '200000', 10) || 200000)
);
const INITIAL_SCAN_BLOCKS = BigInt(
  Math.max(1, Number.parseInt(process.env.TX_SCAN_INITIAL_BLOCKS ?? '20000', 10) || 20000)
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

const createClient = (url: string, timeout = 15000) =>
  createPublicClient({
    chain: tempoModerato,
    transport: http(url, { timeout }),
  });

async function withFallback<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const urls = getTempoRpcUrls();
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fn(createClient(url));
    } catch (error) {
      lastError = error;
      // Continue to next URL
    }
  }
  throw lastError ?? new Error('All RPC endpoints failed');
}

function decodeTransaction(input: `0x${string}`): { type: string; amount: string; functionName: string } {
  try {
    const decoded = decodeFunctionData({ abi: DEX_ABI, data: input });
    const functionName = decoded.functionName;

    switch (functionName) {
      case 'swapExactAmountIn':
        return {
          type: 'Swap',
          amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'place':
        return {
          type: 'Order Placed',
          amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'placeFlip':
        return {
          type: 'Order Placed (Flip)',
          amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'addLiquidity':
        return {
          type: 'Add Liquidity',
          amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'removeLiquidity':
        return {
          type: 'Remove Liquidity',
          amount: (decoded.args?.[2] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'withdraw':
        return {
          type: 'Withdraw',
          amount: (decoded.args?.[1] as bigint | undefined)?.toString() ?? '0',
          functionName,
        };
      case 'cancel':
        return {
          type: 'Order Cancelled',
          amount: '0',
          functionName,
        };
      default:
        return { type: 'DEX Call', amount: '0', functionName };
    }
  } catch {
    return { type: 'DEX Call', amount: '0', functionName: 'unknown' };
  }
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
    return NextResponse.json({ error: 'Unsupported chain - only Tempo testnet supported' }, { status: 400 });
  }

  try {
    const data = await withFallback(async (client) => {
      const latestBlock = await client.getBlockNumber();
      const minBlock = latestBlock > (MAX_SCAN_BLOCKS - 1n) ? latestBlock - (MAX_SCAN_BLOCKS - 1n) : 0n;

      // Time budget for scanning
      const deadline = Date.now() + 25000;

      const items: TxItem[] = [];
      const dexAddress = TEMPO_DEX_ADDRESS.toLowerCase();
      const fromAddress = address!.toLowerCase();

      const batchSize = 50n;
      let timedOut = false;
      let scanWindow = INITIAL_SCAN_BLOCKS;

      while (items.length < limit && !timedOut) {
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }

        const fromBlock = latestBlock > (scanWindow - 1n) ? latestBlock - (scanWindow - 1n) : 0n;

        for (let end = latestBlock; end >= fromBlock && items.length < limit; end -= batchSize) {
          if (Date.now() > deadline) {
            timedOut = true;
            break;
          }

          const start = end >= (batchSize - 1n) ? end - (batchSize - 1n) : 0n;
          if (start > end) break;

          // Build array of block numbers to fetch
          const blockNumbers: bigint[] = [];
          for (let b = end; b >= start; b -= 1n) {
            blockNumbers.push(b);
          }

          try {
            const blockResults = await Promise.allSettled(
              blockNumbers.map((blockNumber) =>
                client.getBlock({ blockNumber, includeTransactions: true })
              )
            );

            const successfulBlocks = blockResults
              .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof client.getBlock>>> =>
                result.status === 'fulfilled'
              )
              .map((result) => result.value);

            // Process transactions from each block
            for (const block of successfulBlocks) {
              if (items.length >= limit) break;

              for (const tx of block.transactions) {
                if (items.length >= limit) break;
                if (!tx.to) continue;
                if (tx.to.toLowerCase() !== dexAddress) continue;
                if (tx.from?.toLowerCase() !== fromAddress) continue;

                const decoded = decodeTransaction(tx.input);

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
          } catch (batchError) {
            console.error('Batch fetch error:', batchError);
          }

          if (start === 0n) break;
        }

        if (fromBlock === 0n || scanWindow >= MAX_SCAN_BLOCKS) break;
        scanWindow = scanWindow * 2n > MAX_SCAN_BLOCKS ? MAX_SCAN_BLOCKS : scanWindow * 2n;
      }

      // Fetch receipts in parallel for status
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

      return {
        items: items.map((item) => ({
          ...item,
          block: item.block.toString(),
        })),
        total: items.length,
        partial: timedOut || items.length < limit,
        scannedBlocks: Number(latestBlock - minBlock),
      };
    });

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
        error: message,
        items: [],
        total: 0,
        partial: true,
      },
      { status: 200 }
    );
  }
}
