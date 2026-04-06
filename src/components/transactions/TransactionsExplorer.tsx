'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnitsFixed } from '@/lib/format';
import { getExplorerTxUrl } from '@/lib/explorer';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';

type TxItem = {
  hash: string;
  block: string;
  type: string;
  status: string;
  amount: string;
  functionName?: string;
  timestamp?: number;
};

type TxResponse = {
  items?: TxItem[];
  nextToBlock?: string | null;
  hasMore?: boolean;
  timedOut?: boolean;
  notice?: string | null;
  networkLabel?: string;
  activityMode?: 'tempo' | 'arc' | 'unsupported';
  supportsOrders?: boolean;
  error?: string;
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    Success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    Confirmed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    Failed: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
    Cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
    Unknown: { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-500' },
  };
  const style = config[status] || config.Pending;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  let icon = 'receipt_long';
  let color = 'text-slate-500 dark:text-slate-400';

  if (normalized.includes('swap')) {
    icon = 'swap_horiz';
    color = 'text-primary';
  } else if (normalized.includes('cancel')) {
    icon = 'block';
    color = 'text-red-400';
  } else if (normalized.includes('order') || normalized.includes('place')) {
    icon = 'candlestick_chart';
    color = 'text-violet-400';
  } else if (normalized.includes('liquidity') || normalized.includes('mint') || normalized.includes('burn')) {
    icon = 'water_drop';
    color = 'text-sky-400';
  } else if (normalized.includes('pause')) {
    icon = 'pause_circle';
    color = 'text-amber-400';
  }

  return (
    <span className={`flex items-center gap-1.5 ${color}`}>
      <span className="material-symbols-outlined text-base">{icon}</span>
      <span className="truncate">{type}</span>
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl token-input-bg p-3 animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

function getFallbackNetworkLabel(chainId: number) {
  if (isTempoNativeChain(chainId)) return 'Testnet';
  if (isArcChain(chainId)) return 'Arc Testnet';
  return 'Supported Network';
}

export function TransactionsExplorer() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [queryAddress, setQueryAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'swaps' | 'orders' | 'liquidity'>('all');
  const [nextToBlock, setNextToBlock] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [supportsOrders, setSupportsOrders] = useState(isTempoNativeChain(chainId));
  const [networkLabel, setNetworkLabel] = useState(getFallbackNetworkLabel(chainId));
  const [activityMode, setActivityMode] = useState<'tempo' | 'arc' | 'unsupported'>(
    isTempoNativeChain(chainId) ? 'tempo' : isArcChain(chainId) ? 'arc' : 'unsupported'
  );

  useEffect(() => {
    if (address && queryAddress.length === 0) {
      setQueryAddress(address);
    }
  }, [address, queryAddress.length]);

  useEffect(() => {
    if (!supportsOrders && filter === 'orders') {
      setFilter('all');
    }
  }, [filter, supportsOrders]);

  const applyResponse = useCallback((result: TxResponse, append = false) => {
    setError(result.error ?? null);
    setNotice(result.notice ?? null);
    setSupportsOrders(result.supportsOrders ?? isTempoNativeChain(chainId));
    setNetworkLabel(result.networkLabel ?? getFallbackNetworkLabel(chainId));
    setActivityMode(result.activityMode ?? (isTempoNativeChain(chainId) ? 'tempo' : isArcChain(chainId) ? 'arc' : 'unsupported'));
    setTimedOut(result.timedOut ?? false);
    setNextToBlock(result.nextToBlock ?? null);
    setHasMore(result.hasMore ?? false);

    if (!append) {
      setItems(result.items ?? []);
      return;
    }

    setItems((currentItems) => {
      const merged = new Map<string, TxItem>();
      currentItems.forEach((item) => merged.set(item.hash, item));
      (result.items ?? []).forEach((item) => {
        const existing = merged.get(item.hash);
        if (!existing) {
          merged.set(item.hash, item);
          return;
        }
        const existingBlock = Number(existing.block || '0');
        const nextBlock = Number(item.block || '0');
        if (nextBlock >= existingBlock) {
          merged.set(item.hash, item);
        }
      });
      return Array.from(merged.values());
    });
  }, [chainId]);

  const fetchTransactions = useCallback(async (reset = true) => {
    if (!queryAddress) return;
    setIsLoading(true);
    setError(null);
    if (reset) {
      setItems([]);
      setNextToBlock(null);
      setHasMore(false);
      setTimedOut(false);
      setNotice(null);
    }
    try {
      const response = await fetch(`/api/transactions?address=${queryAddress}&chainId=${chainId}&limit=30`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const result = (await response.json()) as TxResponse;
      applyResponse(result, false);
      setLastUpdated(Date.now());
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch transactions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [applyResponse, chainId, queryAddress]);

  const loadMoreTransactions = useCallback(async () => {
    if (!queryAddress || !nextToBlock || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/transactions?address=${queryAddress}&chainId=${chainId}&limit=30&toBlock=${nextToBlock}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const result = (await response.json()) as TxResponse;
      applyResponse(result, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load more transactions';
      setError(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [applyResponse, chainId, isLoadingMore, nextToBlock, queryAddress]);

  useEffect(() => {
    if (queryAddress) {
      fetchTransactions();
    }
  }, [queryAddress, chainId, fetchTransactions]);

  useEffect(() => {
    if (!queryAddress) return undefined;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLoading) {
        fetchTransactions();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchTransactions, isLoading, queryAddress]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => {
      const type = item.type.toLowerCase();
      if (filter === 'swaps') return type.includes('swap');
      if (filter === 'orders') return type.includes('order') || type.includes('place') || type.includes('cancel');
      if (filter === 'liquidity') return type.includes('liquidity') || type.includes('mint') || type.includes('burn');
      return true;
    });
  }, [items, filter]);

  const stats = useMemo(() => {
    const swaps = items.filter((i) => i.type.toLowerCase().includes('swap')).length;
    const orders = items.filter((i) => i.type.toLowerCase().includes('order') || i.type.toLowerCase().includes('place') || i.type.toLowerCase().includes('cancel')).length;
    const liquidity = items.filter((i) => i.type.toLowerCase().includes('liquidity') || i.type.toLowerCase().includes('mint') || i.type.toLowerCase().includes('burn')).length;
    const success = items.filter((i) => i.status === 'Success' || i.status === 'Confirmed').length;
    return {
      total: items.length,
      swaps,
      orders,
      liquidity,
      successRate: items.length > 0 ? Math.round((success / items.length) * 100) : 0,
    };
  }, [items]);

  const activityDescription = useMemo(() => {
    if (activityMode === 'tempo') {
      return 'Track swaps, limit orders, and liquidity actions onchain.';
    }
    if (activityMode === 'arc') {
      return 'Track stable swaps and liquidity actions on Arc.';
    }
    return 'Activity adapts to the active network and only shows flows supported by that deployment.';
  }, [activityMode]);

  const filters = supportsOrders
    ? (['all', 'swaps', 'orders', 'liquidity'] as const)
    : (['all', 'swaps', 'liquidity'] as const);

  return (
    <div className="w-full max-w-5xl rounded-2xl glass-panel p-6 shadow-xl">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {networkLabel}
          </div>
          <h2 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Transaction History</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activityDescription}
            {lastUpdated && (
              <span className="text-slate-400 dark:text-slate-500"> • Updated {Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))}s ago</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={queryAddress}
              onChange={(e) => setQueryAddress(e.target.value.trim())}
              placeholder="0x wallet address"
              className="w-72 max-w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors token-input-bg placeholder-slate-400 focus:border-primary/50 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
            />
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={() => fetchTransactions(true)}
            disabled={isLoading}
            className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-all hover:border-primary/50 disabled:opacity-50"
          >
            {isLoading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {timedOut && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
          Activity scan timed out before the full block range finished loading. Refresh to continue scanning recent history.
        </div>
      )}

      <div className={`mb-6 grid gap-3 ${supportsOrders ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
        <div className="rounded-xl border border-slate-200 p-3 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Total Txns</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Swaps</p>
          <p className="text-xl font-bold text-primary">{stats.swaps}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{supportsOrders ? 'Orders' : 'Liquidity Ops'}</p>
          <p className="text-xl font-bold text-violet-500 dark:text-violet-400">{supportsOrders ? stats.orders : stats.liquidity}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Success Rate</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.successRate}%</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === f
                ? 'border border-primary/30 bg-primary/10 text-primary'
                : 'border border-slate-200 text-slate-500 token-input-bg hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-60">
                ({f === 'swaps' ? stats.swaps : f === 'orders' ? stats.orders : stats.liquidity})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 token-input-bg dark:border-slate-800">
        <div className="grid grid-cols-12 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          <span className="col-span-4">Type</span>
          <span className="col-span-3">Amount</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-3">Transaction</span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-4">
              <LoadingSkeleton />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="mx-auto mb-4 h-12 w-12 text-slate-400 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-slate-500 dark:text-slate-400">No transactions found</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {notice ?? 'Try a different address or refresh after completing a swap or liquidity action.'}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const amountDisplay = item.amount && item.amount !== '0' ? formatUnitsFixed(BigInt(item.amount), 6) : '--';
              return (
                <div
                  key={`${item.hash}-${item.block}`}
                  className="grid grid-cols-12 items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
                >
                  <div className="col-span-4">
                    <TypeBadge type={item.type} />
                  </div>
                  <div className="col-span-3 font-mono text-slate-900 dark:text-white">{amountDisplay}</div>
                  <div className="col-span-2">
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="col-span-3">
                    <a
                      href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-xs text-primary transition-colors hover:text-primary/80"
                    >
                      {item.hash.slice(0, 8)}...{item.hash.slice(-6)}
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasMore && !isLoading && filteredItems.length > 0 && (
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              onClick={loadMoreTransactions}
              disabled={isLoadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 py-3 text-sm font-medium text-primary transition-all hover:border-primary/30 disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading older transactions...' : 'Load More Transactions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
