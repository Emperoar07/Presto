import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import { mergeForkPoolStats } from '../src/lib/forkPoolStats';

const USDC = '0x3600000000000000000000000000000000000000' as Address;
const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as Address;

const hubPool = {
  tokenAddress: '0x1111111111111111111111111111111111111111',
  liquidity: '$10.0K',
  liquidityRaw: '10000000000',
  vol24h: '$4.0K',
  vol24hRaw: '4000000000',
  swapCount: 5,
  hasLiquidity: true,
  volumeAvailable: true,
};

const cirbtcPool = {
  tokenAddress: CIRBTC,
  liquidity: '$0',
  liquidityRaw: '0',
  vol24h: '$0',
  vol24hRaw: '0',
  swapCount: 0,
  hasLiquidity: false,
  volumeAvailable: false,
  snapshot: { volRaw: '0', swapCount: 0 },
};

test('merges fork TVL and rolling volume into only the cirBTC pool', () => {
  const pools = [hubPool, cirbtcPool];
  const result = mergeForkPoolStats(pools, CIRBTC, {
    usdc: USDC,
    token0: USDC,
    reserve0: 8_450_000_000n,
    reserve1: 30_000n,
    volumeRaw: 63_346_118n,
    swapCount: 2,
    volumeAvailable: true,
  });

  assert.equal(result[0], hubPool, 'unrelated Hub pool is unchanged');
  assert.deepEqual(result[1], {
    ...cirbtcPool,
    liquidity: '$16.9K',
    liquidityRaw: '16900000000',
    vol24h: '$63.35',
    vol24hRaw: '63346118',
    swapCount: 2,
    hasLiquidity: true,
    volumeAvailable: true,
    snapshot: { volRaw: '63346118', swapCount: 2 },
  });
});

test('marks cold scan volume unavailable without reporting a measured zero', () => {
  const [result] = mergeForkPoolStats([cirbtcPool], CIRBTC, {
    usdc: USDC,
    token0: CIRBTC,
    reserve0: 30_000n,
    reserve1: 8_450_000_000n,
    volumeRaw: null,
    swapCount: null,
    volumeAvailable: false,
  });

  assert.equal(result.liquidity, '$16.9K');
  assert.equal(result.vol24h, '--');
  assert.equal(result.vol24hRaw, '0');
  assert.equal(result.volumeAvailable, false);
});
