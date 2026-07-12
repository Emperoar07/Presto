import { formatUnits, parseAbiItem, type Address } from 'viem';

export type UniswapV2SwapArgs = {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
};

type BlockTimestampClient = {
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
};

type UniswapVolumeClient = BlockTimestampClient & {
  getLogs(args: {
    address: Address;
    event: typeof UNISWAP_V2_SWAP_EVENT;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly unknown[]>;
};

const UNISWAP_V2_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);

// Arc RPCs accept up to ~10k-block eth_getLogs ranges (the hub scan uses 9,999),
// so scan the 24h window in 9,999-block chunks — ~10x fewer calls than 1k chunks.
const ARC_LOG_CHUNK_SIZE = 9_999n;
const MAX_PARALLEL_LOG_REQUESTS = 6;
// Cap the from-block binary search: 24h is well under ~600k Arc blocks (~0.5s/block),
// so we never need to search from genesis.
const MAX_LOOKBACK_BLOCKS = 600_000n;

function decodedSwapArgs(log: unknown): UniswapV2SwapArgs {
  const args = (log as { args?: Partial<UniswapV2SwapArgs> })?.args;
  if (
    !args ||
    typeof args.amount0In !== 'bigint' ||
    typeof args.amount1In !== 'bigint' ||
    typeof args.amount0Out !== 'bigint' ||
    typeof args.amount1Out !== 'bigint'
  ) {
    throw new Error('Swap log is missing complete decoded amount fields');
  }
  return args as UniswapV2SwapArgs;
}

export function sumUsdcVolume(
  logs: readonly UniswapV2SwapArgs[],
  usdc: Address,
  token0: Address,
  token1: Address,
): { volumeRaw: bigint; swapCount: number } {
  const normalizedUsdc = usdc.toLowerCase();
  const usdcIsToken0 = token0.toLowerCase() === normalizedUsdc;
  const usdcIsToken1 = token1.toLowerCase() === normalizedUsdc;

  if (usdcIsToken0 === usdcIsToken1) {
    throw new Error('Pair must contain USDC on exactly one side');
  }

  const volumeRaw = logs.reduce((total, log) => {
    const amountIn = usdcIsToken0 ? log.amount0In : log.amount1In;
    const amountOut = usdcIsToken0 ? log.amount0Out : log.amount1Out;

    if (amountIn !== 0n && amountOut !== 0n) {
      throw new Error('USDC input and output cannot both be nonzero');
    }

    return total + (amountIn !== 0n ? amountIn : amountOut);
  }, 0n);

  return { volumeRaw, swapCount: logs.length };
}

export function formatUsdcVolume(raw: bigint): string {
  return formatUnits(raw, 6);
}

export async function findFirstBlockAtOrAfter(
  client: BlockTimestampClient,
  lowBlock: bigint,
  highBlock: bigint,
  cutoffTimestamp: bigint,
): Promise<bigint> {
  let low = lowBlock;
  let high = highBlock;

  while (low < high) {
    const middle = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: middle });
    if (block.timestamp < cutoffTimestamp) low = middle + 1n;
    else high = middle;
  }

  return low;
}

export async function scanUniswapV2Volume(
  client: UniswapVolumeClient,
  pair: Address,
  usdc: Address,
  token0: Address,
  token1: Address,
  latestBlock: bigint,
  cutoffTimestamp: bigint,
): Promise<{ fromBlock: bigint; toBlock: bigint; volumeRaw: bigint; swapCount: number }> {
  const searchLow = latestBlock > MAX_LOOKBACK_BLOCKS ? latestBlock - MAX_LOOKBACK_BLOCKS : 0n;
  const fromBlock = await findFirstBlockAtOrAfter(client, searchLow, latestBlock, cutoffTimestamp);
  const swapArgs: UniswapV2SwapArgs[] = [];
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  for (let start = fromBlock; start <= latestBlock; start += ARC_LOG_CHUNK_SIZE) {
    const end = start + ARC_LOG_CHUNK_SIZE - 1n;
    ranges.push({ fromBlock: start, toBlock: end < latestBlock ? end : latestBlock });
  }

  for (let index = 0; index < ranges.length; index += MAX_PARALLEL_LOG_REQUESTS) {
    const batch = ranges.slice(index, index + MAX_PARALLEL_LOG_REQUESTS);
    const results = await Promise.all(batch.map(({ fromBlock: start, toBlock: end }) =>
      client.getLogs({
        address: pair,
        event: UNISWAP_V2_SWAP_EVENT,
        fromBlock: start,
        toBlock: end,
      })
    ));
    for (const logs of results) {
      for (const log of logs) {
        swapArgs.push(decodedSwapArgs(log));
      }
    }
  }

  return {
    fromBlock,
    toBlock: latestBlock,
    ...sumUsdcVolume(swapArgs, usdc, token0, token1),
  };
}
