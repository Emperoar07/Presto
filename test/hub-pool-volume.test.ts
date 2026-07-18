import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import {
  scanHubPoolVolume,
  sumHubPoolVolume,
  type HubSwapArgs,
} from '../src/lib/hubPoolVolume';

const USDC = '0x3600000000000000000000000000000000000000' as Address;
const EURC = '0x1111111111111111111111111111111111111111' as Address;
const USDT = '0x2222222222222222222222222222222222222222' as Address;
const HUB = '0x3333333333333333333333333333333333333333' as Address;

function swap(overrides: Partial<HubSwapArgs>): HubSwapArgs {
  return {
    tokenIn: USDC,
    tokenOut: EURC,
    amountIn: 0n,
    amountOut: 0n,
    ...overrides,
  };
}

test('counts only swap amounts and attributes USDC volume to the traded pool', () => {
  const result = sumHubPoolVolume([
    swap({ amountIn: 12_500_000n, amountOut: 12_400_000n }),
    swap({ tokenIn: EURC, tokenOut: USDC, amountIn: 4_000_000n, amountOut: 3_900_000n }),
  ], USDC, new Map([[EURC.toLowerCase(), 6]]));

  assert.deepEqual(result.get(EURC.toLowerCase()), {
    volumeRaw: 16_400_000n,
    swapCount: 2,
  });
});

test('normalizes token to token swap input to USDC decimals', () => {
  const result = sumHubPoolVolume([
    swap({ tokenIn: USDT, tokenOut: EURC, amountIn: 2_500_000_000_000_000_000n, amountOut: 2_490_000n }),
  ], USDC, new Map([[USDT.toLowerCase(), 18], [EURC.toLowerCase(), 6]]));

  assert.deepEqual(result.get(USDT.toLowerCase()), {
    volumeRaw: 2_500_000n,
    swapCount: 1,
  });
});

test('scans only the rolling timestamp window in bounded log chunks', async () => {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = {
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      return { timestamp: blockNumber * 10n };
    },
    async getLogs(request: { fromBlock: bigint; toBlock: bigint }) {
      ranges.push({ fromBlock: request.fromBlock, toBlock: request.toBlock });
      return [{ args: swap({ amountIn: 1_000_000n }) }];
    },
  };

  const result = await scanHubPoolVolume(
    client,
    HUB,
    USDC,
    new Map([[EURC.toLowerCase(), 6]]),
    25_000n,
    100_000n,
  );

  assert.deepEqual(ranges, [
    { fromBlock: 10_000n, toBlock: 19_998n },
    { fromBlock: 19_999n, toBlock: 25_000n },
  ]);
  assert.equal(result.fromBlock, 10_000n);
  assert.deepEqual(result.pools.get(EURC.toLowerCase()), {
    volumeRaw: 2_000_000n,
    swapCount: 2,
  });
});

test('does not issue archive reads outside the maximum 24 hour lookback', async () => {
  const requestedBlocks: bigint[] = [];
  const client = {
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      requestedBlocks.push(blockNumber);
      return { timestamp: blockNumber * 10n };
    },
    async getLogs() {
      return [];
    },
  };

  await scanHubPoolVolume(
    client,
    HUB,
    USDC,
    new Map([[EURC.toLowerCase(), 6]]),
    1_000_000n,
    4_000_000n,
  );

  assert.ok(requestedBlocks.every((block) => block >= 400_000n));
});
