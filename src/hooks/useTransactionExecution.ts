'use client';

import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { refreshPrestoQueries, emitPrestoDataRefresh } from '@/lib/appDataRefresh';
import toast from 'react-hot-toast';
import { logError } from '@/lib/errorHandling';

export type TxExecutionOptions = {
  onSuccess?: (hash: `0x${string}`) => void | Promise<void>;
  onSubmitted?: (hash: `0x${string}`) => void | Promise<void>;
  reason?: 'swap' | 'bridge' | 'liquidity' | 'manual';
};

export function useTransactionExecution() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const execute = async (
    txName: string,
    txFn: () => Promise<`0x${string}`>,
    options: TxExecutionOptions = {}
  ): Promise<`0x${string}` | null> => {
    if (!publicClient) {
      toast.error('Web3 provider not initialized');
      return null;
    }

    const reason = options.reason ?? 'manual';
    const toastId = toast.loading(`Submitting ${txName}...`);

    try {
      // Execute the contract write call to get transaction hash
      const hash = await txFn();

      if (options.onSubmitted) {
        await options.onSubmitted(hash);
      }

      toast.loading(`Waiting for ${txName} confirmation...`, { id: toastId });

      // Wait for the transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        throw new Error(`${txName} transaction was reverted on-chain.`);
      }

      // Automatically invalidate relevant React Query keys
      await refreshPrestoQueries(queryClient, { address, chainId });
      // Emit event for other components and tabs
      emitPrestoDataRefresh(reason);

      toast.success(`${txName} completed successfully!`, { id: toastId });

      if (options.onSuccess) {
        await options.onSuccess(hash);
      }

      return hash;
    } catch (error: unknown) {
      logError(error, `${txName} failed`);
      
      // Extract a readable error message or use a fallback
      const errMsg = error instanceof Error ? error.message : 'Unknown transaction error';
      // If it's a user cancel, we don't need a noisy toast message
      const isUserCancel = errMsg.toLowerCase().includes('user rejected') || 
                           errMsg.toLowerCase().includes('user denied');
      
      if (isUserCancel) {
        toast.dismiss(toastId);
      } else {
        toast.error(`${txName} failed: ${errMsg.slice(0, 80)}${errMsg.length > 80 ? '...' : ''}`, { id: toastId });
      }
      throw error;
    }
  };

  return { execute };
}
