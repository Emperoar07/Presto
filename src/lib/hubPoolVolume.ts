import { parseAbiItem, type Address } from 'viem';
import { findFirstBlockAtOrAfter } from './uniswapV2Volume';

export type HubSwapArgs = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
};

export type HubPoolVolume = {
  volumeRaw: bigint;
  swapCount: number;
};

type HubVolumeClient = {
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getLogs(args: {
    address: Address;
    event: typeof HUB_SWAP_EVENT;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly unknown[]>;
};

const HUB_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
);
const LOG_CHUNK_SIZE = 9_999n;
const MAX_PARALLEL_LOG_REQUESTS = 6;
const MAX_LOOKBACK_BLOCKS = 600_000n;
const USDC_DECIMALS = 6;

function normalizeToUsdcRaw(amount: bigint, decimals: number): bigint {
  if (decimals === USDC_DECIMALS) return amount;
  if (decimals > USDC_DECIMALS) return amount / 10n ** BigInt(decimals - USDC_DECIMALS);
  return amount * 10n ** BigInt(USDC_DECIMALS - decimals);
}

function decodedSwapArgs(log: unknown): HubSwapArgs {
  const args = (log as { args?: Partial<HubSwapArgs> })?.args;
  if (
    !args ||
    typeof args.tokenIn !== 'string' ||
    typeof args.tokenOut !== 'string' ||
    typeof args.amountIn !== 'bigint' ||
    typeof args.amountOut !== 'bigint'
  ) {
    throw new Error('Hub Swap log is missing complete decoded fields');
  }
  return args as HubSwapArgs;
}

export function sumHubPoolVolume(
  swaps: readonly HubSwapArgs[],
  usdc: Address,
  tokenDecimals: ReadonlyMap<string, number>,
): Map<string, HubPoolVolume> {
  const result = new Map<string, HubPoolVolume>();
  const usdcLower = usdc.toLowerCase();

  for (const swap of swaps) {
    const tokenIn = swap.tokenIn.toLowerCase();
    const tokenOut = swap.tokenOut.toLowerCase();
    const poolKey = tokenIn === usdcLower ? tokenOut : tokenIn;
    const volumeRaw = tokenIn === usdcLower
      ? swap.amountIn
      : tokenOut === usdcLower
        ? swap.amountOut
        : normalizeToUsdcRaw(swap.amountIn, tokenDecimals.get(tokenIn) ?? USDC_DECIMALS);
    const current = result.get(poolKey) ?? { volumeRaw: 0n, swapCount: 0 };
    result.set(poolKey, {
      volumeRaw: current.volumeRaw + volumeRaw,
      swapCount: current.swapCount + 1,
    });
  }

  return result;
}

export async function scanHubPoolVolume(
  client: HubVolumeClient,
  hubAmm: Address,
  usdc: Address,
  tokenDecimals: ReadonlyMap<string, number>,
  latestBlock: bigint,
  cutoffTimestamp: bigint,
): Promise<{ fromBlock: bigint; toBlock: bigint; pools: Map<string, HubPoolVolume> }> {
  const searchLow = latestBlock > MAX_LOOKBACK_BLOCKS ? latestBlock - MAX_LOOKBACK_BLOCKS : 0n;
  const fromBlock = await findFirstBlockAtOrAfter(client, searchLow, latestBlock, cutoffTimestamp);
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const swaps: HubSwapArgs[] = [];

  for (let start = fromBlock; start <= latestBlock; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n;
    ranges.push({ fromBlock: start, toBlock: end < latestBlock ? end : latestBlock });
  }

  for (let index = 0; index < ranges.length; index += MAX_PARALLEL_LOG_REQUESTS) {
    const batch = ranges.slice(index, index + MAX_PARALLEL_LOG_REQUESTS);
    const results = await Promise.all(batch.map(({ fromBlock: start, toBlock: end }) =>
      client.getLogs({
        address: hubAmm,
        event: HUB_SWAP_EVENT,
        fromBlock: start,
        toBlock: end,
      })
    ));
    for (const logs of results) {
      for (const log of logs) swaps.push(decodedSwapArgs(log));
    }
  }

  return {
    fromBlock,
    toBlock: latestBlock,
    pools: sumHubPoolVolume(swaps, usdc, tokenDecimals),
  };
}
