import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import {
  formatUsdcVolume,
  sumUsdcVolume,
  type UniswapV2SwapArgs,
} from '../src/lib/uniswapV2Volume';

const USDC = '0x3600000000000000000000000000000000000000' as Address;
const CIRBTC = '0x1111111111111111111111111111111111111111' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;

function swap(overrides: Partial<UniswapV2SwapArgs>): UniswapV2SwapArgs {
  return {
    amount0In: 0n,
    amount1In: 0n,
    amount0Out: 0n,
    amount1Out: 0n,
    ...overrides,
  };
}

test('sums USDC inputs and outputs when USDC is token0', () => {
  const result = sumUsdcVolume([
    swap({ amount0In: 20_000_000n, amount1Out: 25_000n }),
    swap({ amount1In: 10_000n, amount0Out: 31_000_000n }),
  ], USDC, USDC, CIRBTC);

  assert.deepEqual(result, { volumeRaw: 51_000_000n, swapCount: 2 });
});

test('sums USDC inputs and outputs when USDC is token1', () => {
  const result = sumUsdcVolume([
    swap({ amount1In: 7_500_000n, amount0Out: 8_000n }),
    swap({ amount0In: 9_000n, amount1Out: 12_250_000n }),
  ], USDC, CIRBTC, USDC);

  assert.deepEqual(result, { volumeRaw: 19_750_000n, swapCount: 2 });
});

test('counts each swap log once when both USDC fields are populated', () => {
  const result = sumUsdcVolume([
    swap({ amount0In: 5_000_000n, amount0Out: 4_000_000n }),
  ], USDC, USDC, CIRBTC);

  assert.deepEqual(result, { volumeRaw: 5_000_000n, swapCount: 1 });
});

test('returns zero volume and swaps for empty input', () => {
  assert.deepEqual(
    sumUsdcVolume([], USDC, USDC, CIRBTC),
    { volumeRaw: 0n, swapCount: 0 },
  );
});

test('rejects a pair that does not contain USDC', () => {
  assert.throws(
    () => sumUsdcVolume([], USDC, CIRBTC, OTHER),
    /USDC/i,
  );
});

test('formats USDC without losing six-decimal raw precision', () => {
  assert.equal(formatUsdcVolume(1_234_567n), '1.234567');
  assert.equal(formatUsdcVolume(1n), '0.000001');
});
