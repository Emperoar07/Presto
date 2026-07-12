import { formatUnits, type Address } from 'viem';

export type UniswapV2SwapArgs = {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
};

export function sumUsdcVolume(
  logs: readonly UniswapV2SwapArgs[],
  usdc: Address,
  token0: Address,
  token1: Address,
): { volumeRaw: bigint; swapCount: number } {
  const normalizedUsdc = usdc.toLowerCase();
  const usdcIsToken0 = token0.toLowerCase() === normalizedUsdc;
  const usdcIsToken1 = token1.toLowerCase() === normalizedUsdc;

  if (!usdcIsToken0 && !usdcIsToken1) {
    throw new Error('Pair does not contain USDC');
  }

  const volumeRaw = logs.reduce((total, log) => {
    const amountIn = usdcIsToken0 ? log.amount0In : log.amount1In;
    const amountOut = usdcIsToken0 ? log.amount0Out : log.amount1Out;
    return total + (amountIn !== 0n ? amountIn : amountOut);
  }, 0n);

  return { volumeRaw, swapCount: logs.length };
}

export function formatUsdcVolume(raw: bigint): string {
  return formatUnits(raw, 6);
}
