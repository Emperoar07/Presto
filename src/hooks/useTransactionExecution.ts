'use client';

import React from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { refreshPrestoQueries, emitPrestoDataRefresh } from '@/lib/appDataRefresh';
import toast from 'react-hot-toast';
import { logError } from '@/lib/errorHandling';
import { TxToast } from '@/components/common/TxToast';

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
    
    // Create custom pending toast using TxToast
    const toastId = toast.custom(
      () => React.createElement(TxToast, { title: `Submitting ${txName}...`, status: 'pending' }),
      { duration: Infinity }
    );

    let txHash: `0x${string}` | undefined;

    try {
      // Execute the contract write call to get transaction hash
      const hash = await txFn();
      txHash = hash;

      if (options.onSubmitted) {
        await options.onSubmitted(hash);
      }

      // Update the custom toast to show pending with transaction hash and explorer link
      toast.custom(
        () => React.createElement(TxToast, { hash, title: `Waiting for ${txName} confirmation...`, status: 'pending' }),
        { id: toastId, duration: Infinity }
      );

      // Wait for the transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        throw new Error(`${txName} transaction was reverted on-chain.`);
      }

      // Automatically invalidate relevant React Query keys
      await refreshPrestoQueries(queryClient, { address, chainId });
      // Emit event for other components and tabs
      emitPrestoDataRefresh(reason);

      // Transition to success state and auto-dismiss after 5 seconds
      toast.custom(
        () => React.createElement(TxToast, { hash, title: `${txName} completed successfully!`, status: 'success' }),
        { id: toastId, duration: 5000 }
      );

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
        // Transition to error state and auto-dismiss after 6 seconds
        toast.custom(
          () => React.createElement(TxToast, { 
            hash: txHash, 
            title: `${txName} failed: ${errMsg.slice(0, 60)}${errMsg.length > 60 ? '...' : ''}`, 
            status: 'error' 
          }),
          { id: toastId, duration: 6000 }
        );
      }
      throw error;
    }
  };

  return { execute };
}
