import type { PublicClient, WalletClient } from 'viem';

const UNDERPRICED_PATTERNS = [
  'replacement transaction underpriced',
  'transaction underpriced',
  'fee too low',
  'underpriced',
];

export const isUnderpricedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return UNDERPRICED_PATTERNS.some((pattern) => lower.includes(pattern));
};

type WriteRequest = Parameters<WalletClient['writeContract']>[0];

type RetryOptions = {
  maxRetries?: number;
  bumpPercent?: number;
  onRetry?: (attempt: number, gasPrice: bigint) => void;
};

export async function writeContractWithRetry(
  walletClient: WalletClient,
  publicClient: PublicClient | undefined,
  request: WriteRequest,
  options: RetryOptions = {}
) {
  const maxRetries = options.maxRetries ?? 1;
  const bumpPercent = options.bumpPercent ?? 20;
  let attempt = 0;
  let gasPriceOverride: bigint | undefined;

  while (attempt <= maxRetries) {
    try {
      const payload = gasPriceOverride
        ? { ...request, gasPrice: gasPriceOverride }
        : request;
      return await walletClient.writeContract(payload);
    } catch (error) {
      if (!isUnderpricedError(error) || !publicClient || attempt >= maxRetries) {
        throw error;
      }

      const baseGasPrice = gasPriceOverride ?? (await publicClient.getGasPrice());
      const bump = (baseGasPrice * BigInt(bumpPercent)) / 100n;
      gasPriceOverride = baseGasPrice + bump;
      attempt += 1;
      options.onRetry?.(attempt, gasPriceOverride);
    }
  }

  throw new Error('Transaction failed after retries');
}
