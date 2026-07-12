import type { Address } from 'viem';

export type ForkPoolRecord = {
  tokenAddress: string;
  liquidity: string;
  liquidityRaw: string;
  vol24h: string;
  vol24hRaw: string;
  swapCount: number;
  hasLiquidity: boolean;
  volumeAvailable?: boolean;
  snapshot?: { volRaw: string; swapCount: number };
};

export type ForkPoolMetrics = {
  usdc: Address;
  token0: Address;
  reserve0: bigint;
  reserve1: bigint;
  volumeRaw: bigint | null;
  swapCount: number | null;
  volumeAvailable: boolean;
};

export function formatCompactUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  if (whole >= 1_000_000n) return `$${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `$${(Number(whole) / 1_000).toFixed(1)}K`;
  if (raw === 0n) return '$0';

  const cents = (raw + 5_000n) / 10_000n;
  return `$${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function mergeForkPoolStats<T extends ForkPoolRecord>(
  pools: readonly T[],
  tokenAddress: Address,
  metrics: ForkPoolMetrics,
): T[] {
  const usdc = metrics.usdc.toLowerCase();
  const token0IsUsdc = metrics.token0.toLowerCase() === usdc;
  const usdcReserve = token0IsUsdc ? metrics.reserve0 : metrics.reserve1;
  const liquidityRaw = usdcReserve * 2n;

  return pools.map((pool) => {
    if (pool.tokenAddress.toLowerCase() !== tokenAddress.toLowerCase()) return pool;

    const volumeRaw = metrics.volumeRaw ?? 0n;
    return {
      ...pool,
      liquidity: formatCompactUsdc(liquidityRaw),
      liquidityRaw: liquidityRaw.toString(),
      vol24h: metrics.volumeAvailable ? formatCompactUsdc(volumeRaw) : '--',
      vol24hRaw: volumeRaw.toString(),
      swapCount: metrics.swapCount ?? 0,
      hasLiquidity: liquidityRaw > 0n,
      volumeAvailable: metrics.volumeAvailable,
      ...(pool.snapshot && {
        snapshot: { volRaw: volumeRaw.toString(), swapCount: metrics.swapCount ?? 0 },
      }),
    };
  });
}
