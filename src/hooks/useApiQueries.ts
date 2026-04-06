'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { getTokens } from '@/config/tokens';
import { getTokenBalancesBatch } from '@/lib/tempoClient';

// ─── Query keys ──────────────────────────────────────────────────────────────
export const queryKeys = {
  dexStats: ['dex-stats'] as const,
  poolStats: ['pool-stats'] as const,
  transactions: (address: string, chainId: number) =>
    ['transactions', address, chainId] as const,
  balances: (address: string, chainId: number) =>
    ['balances', address, chainId] as const,
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchDexStats() {
  const res = await fetch('/api/dex-stats');
  if (!res.ok) throw new Error('dex-stats fetch failed');
  return res.json();
}

async function fetchPoolStats() {
  const res = await fetch('/api/pool-stats');
  if (!res.ok) throw new Error('pool-stats fetch failed');
  return res.json();
}

async function fetchTransactions(address: string, chainId: number) {
  const res = await fetch(`/api/transactions?address=${address}&chainId=${chainId}&limit=12`);
  if (!res.ok) throw new Error('transactions fetch failed');
  const data = await res.json();
  return data.items ?? [];
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Dex-wide stats (volume, swap count, unique traders). Polls every 20s. */
export function useDexStats() {
  return useQuery({
    queryKey: queryKeys.dexStats,
    queryFn: fetchDexStats,
    staleTime: 20_000,
    refetchInterval: 20_000,
  });
}

/** Per-pool liquidity & volume. Polls every 20s. */
export function usePoolStats() {
  return useQuery({
    queryKey: queryKeys.poolStats,
    queryFn: fetchPoolStats,
    staleTime: 20_000,
    refetchInterval: 20_000,
  });
}

/** Both dex stats and pool stats in a single hook — used on swap & analytics pages. */
export function useSwapPageStats() {
  const dex = useDexStats();
  const pool = usePoolStats();
  return {
    dexStats: dex.data ?? null,
    poolStats: pool.data ?? null,
    loading: dex.isLoading || pool.isLoading,
  };
}

/** Transaction history for the connected wallet. Polls every 15s. */
export function useTransactions() {
  const { address } = useAccount();
  const chainId = useChainId();

  return useQuery({
    queryKey: queryKeys.transactions(address ?? '', chainId),
    queryFn: () => fetchTransactions(address!, chainId),
    enabled: !!address,
    staleTime: 12_000,
    refetchInterval: 15_000,
    placeholderData: (prev) => prev, // keep previous data while re-fetching (no loading flash)
  });
}

/** Token balances for the connected wallet using multicall batching. Polls every 15s. */
export function useTokenBalances() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const tokens = getTokens(chainId);

  return useQuery({
    queryKey: queryKeys.balances(address ?? '', chainId),
    queryFn: async () => {
      if (!publicClient || !address) return {};
      // getTokenBalancesBatch uses viem readContracts (multicall) internally
      return getTokenBalancesBatch(publicClient, address, tokens);
    },
    enabled: !!address && !!publicClient,
    staleTime: 10_000,
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });
}
