'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { getTokens } from '@/config/tokens';
import { getTokenBalancesBatch } from '@/lib/tempoClient';
import { mergeForkPoolRecord, mergePoolActivityRecords } from '@/lib/forkPoolStats';

// ─── Query keys ──────────────────────────────────────────────────────────────
export const queryKeys = {
  dexStats: ['dex-stats'] as const,
  poolStats: ['pool-stats'] as const,
  poolActivityStats: ['pool-activity-stats'] as const,
  forkPoolStats: ['fork-pool-stats'] as const,
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

async function fetchForkPoolStats() {
  const res = await fetch('/api/pool-stats?mode=fork');
  if (!res.ok) throw new Error('fork pool-stats fetch failed');
  return res.json();
}

async function fetchPoolActivityStats() {
  const res = await fetch('/api/pool-stats?mode=activity');
  if (!res.ok) throw new Error('pool activity-stats fetch failed');
  return res.json();
}

async function fetchTransactions(address: string, chainId: number) {
  const res = await fetch(`/api/transactions?address=${address}&chainId=${chainId}&limit=12`);
  if (!res.ok) throw new Error('transactions fetch failed');
  const data = await res.json();
  return data.items ?? [];
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Dex-wide stats (volume, swap count, unique traders). Polls every 30s. */
export function useDexStats() {
  return useQuery({
    queryKey: queryKeys.dexStats,
    queryFn: fetchDexStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: (prev: unknown) => prev,
  });
}

/** Fast reserve data renders first; historical activity merges when its scan finishes. */
export function usePoolStats() {
  const base = useQuery({
    queryKey: queryKeys.poolStats,
    queryFn: fetchPoolStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: (prev: unknown) => prev,
  });
  const activity = useQuery({
    queryKey: queryKeys.poolActivityStats,
    queryFn: fetchPoolActivityStats,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    placeholderData: (prev: unknown) => prev,
  });
  const data = base.data
    ? { ...base.data, pools: mergePoolActivityRecords(base.data.pools ?? [], activity.data?.pools) }
    : undefined;
  return { ...base, data };
}

/** Fork metrics load independently so historical log scans never block the pool list. */
export function useForkPoolStats() {
  return useQuery({
    queryKey: queryKeys.forkPoolStats,
    queryFn: fetchForkPoolStats,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    placeholderData: (prev: unknown) => prev,
  });
}

/** DEX and pool stats used by the swap workspace. */
export function useSwapPageStats() {
  const dex = useDexStats();
  const pool = usePoolStats();
  const fork = useForkPoolStats();
  const poolStats = pool.data
    ? { ...pool.data, pools: mergeForkPoolRecord(pool.data.pools ?? [], fork.data?.pool) }
    : null;
  return {
    dexStats: dex.data ?? null,
    poolStats,
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
