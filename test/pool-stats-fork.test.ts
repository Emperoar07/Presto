import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import {
  getPoolStatsRequestMode,
  mergePoolActivityRecords,
  mergeForkPoolRecord,
  mergeForkPoolStats,
  selectPoolStatsByToken,
} from '../src/lib/forkPoolStats';
import { readPoolPathReserves } from '../src/lib/poolReserves';
import { mergeRpcUrls, raceRpcUrls } from '../src/lib/rpc';

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

test('selects shared fork stats by token address regardless of pool ordering', () => {
  const selected = selectPoolStatsByToken([cirbtcPool, hubPool], CIRBTC.toUpperCase());

  assert.deepEqual(selected, {
    vol24h: '$0',
    vol24hRaw: '0',
    volumeAvailable: false,
  });
});

test('keeps the default pool stats request on the non-blocking base path', () => {
  assert.equal(getPoolStatsRequestMode('https://presto.test/api/pool-stats'), 'base');
  assert.equal(getPoolStatsRequestMode('https://presto.test/api/pool-stats?mode=fork'), 'fork');
  assert.equal(getPoolStatsRequestMode('https://presto.test/api/pool-stats?mode=activity'), 'activity');
  assert.equal(getPoolStatsRequestMode('https://presto.test/api/pool-stats?mode=unknown'), 'base');
});

test('merges delayed activity without replacing fast reserve data', () => {
  const basePool = { ...hubPool, liquidity: '$12.0K', liquidityRaw: '12000000000', vol24h: '$0', vol24hRaw: '0', swapCount: 0 };
  const activityPool = { ...hubPool, liquidity: '$0', liquidityRaw: '0', vol24h: '$4.0K', vol24hRaw: '4000000000', swapCount: 5 };

  const [result] = mergePoolActivityRecords([basePool], [activityPool]);

  assert.equal(result.liquidity, '$12.0K');
  assert.equal(result.liquidityRaw, '12000000000');
  assert.equal(result.vol24h, '$4.0K');
  assert.equal(result.vol24hRaw, '4000000000');
  assert.equal(result.swapCount, 5);
});

test('merges an independently loaded fork record without changing Hub pools', () => {
  const forkPool = {
    ...cirbtcPool,
    liquidity: '$16.9K',
    liquidityRaw: '16900000000',
    vol24h: '$63.35',
    vol24hRaw: '63346118',
    swapCount: 2,
    hasLiquidity: true,
    volumeAvailable: true,
  };

  const result = mergeForkPoolRecord([hubPool, cirbtcPool], forkPool);

  assert.equal(result[0], hubPool);
  assert.equal(result[1], forkPool);
});

test('reads each pool path reserve once', async () => {
  const calls: string[] = [];
  const reserves = await readPoolPathReserves(['USDT', 'EURC'], async (token) => {
    calls.push(token);
    return token === 'USDT' ? 42n : 84n;
  });

  assert.deepEqual(calls, ['USDT', 'EURC']);
  assert.deepEqual(reserves, [42n, 84n]);
});

test('rejects an incomplete reserve snapshot so another RPC can be tried', async () => {
  await assert.rejects(
    readPoolPathReserves(['USDT', 'EURC'], async (token) => {
      if (token === 'EURC') throw new Error('temporary RPC failure');
      return 42n;
    }),
    /pool reserve reads failed/i
  );
});

test('rejects reserve enrichment when every read fails so another RPC can be tried', async () => {
  await assert.rejects(
    readPoolPathReserves(['USDT', 'EURC'], async () => {
      throw new Error('RPC unavailable');
    }),
    /all pool reserve reads failed/i
  );
});

test('returns the first successful RPC operation when another endpoint is throttled', async () => {
  const result = await raceRpcUrls(['throttled', 'healthy'], async (url) => {
    if (url === 'throttled') throw new Error('request limit reached');
    return 'quoted';
  });

  assert.equal(result, 'quoted');
});

test('reports an RPC failure when every endpoint rejects', async () => {
  await assert.rejects(
    raceRpcUrls(['one', 'two'], async () => {
      throw new Error('offline');
    }),
    /all rpc operations failed/i
  );
});

test('keeps Arc public fallbacks when a preferred RPC is configured', () => {
  assert.deepEqual(
    mergeRpcUrls(
      ['https://custom.arc.example', 'https://rpc.testnet.arc.network'],
      [
        'https://rpc.testnet.arc.network',
        'https://5042002.rpc.thirdweb.com',
        'https://arc-testnet.drpc.org',
      ]
    ),
    [
      'https://custom.arc.example',
      'https://rpc.testnet.arc.network',
      'https://5042002.rpc.thirdweb.com',
      'https://arc-testnet.drpc.org',
    ]
  );
});
