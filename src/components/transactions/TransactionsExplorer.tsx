'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnitsFixed } from '@/lib/format';
import { getExplorerTxUrl } from '@/lib/explorer';

type TxItem = {
  hash: string;
  block: string;
  type: string;
  status: string;
  amount: string;
  functionName?: string;
  timestamp?: number;
};

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    Success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    Confirmed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    Failed: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
    Cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  };
  const style = config[status] || config.Pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

// Type badge component
function TypeBadge({ type }: { type: string }) {
  const isSwap = type.toLowerCase().includes('swap');
  const isCancel = type.toLowerCase().includes('cancel');
  const isOrder = type.toLowerCase().includes('order') || type.toLowerCase().includes('place');
  const isLiquidity = type.toLowerCase().includes('liquidity') || type.toLowerCase().includes('mint') || type.toLowerCase().includes('burn');

  let icon = '📋';
  let color = 'text-zinc-400';

  if (isSwap) {
    icon = '🔄';
    color = 'text-[#00F3FF]';
  } else if (isCancel) {
    icon = '❌';
    color = 'text-red-400';
  } else if (isOrder) {
    icon = '📊';
    color = 'text-purple-400';
  } else if (isLiquidity) {
    icon = '💧';
    color = 'text-blue-400';
  }

  return (
    <span className={`flex items-center gap-1.5 ${color}`}>
      <span className="text-sm">{icon}</span>
      <span className="truncate">{type}</span>
    </span>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 animate-pulse">
          <div className="w-24 h-4 bg-white/10 rounded" />
          <div className="w-20 h-4 bg-white/10 rounded" />
          <div className="w-16 h-4 bg-white/10 rounded" />
          <div className="w-24 h-4 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TransactionsExplorer() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [queryAddress, setQueryAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'swaps' | 'orders' | 'liquidity'>('all');

  useEffect(() => {
    if (address && queryAddress.length === 0) {
      setQueryAddress(address);
    }
  }, [address, queryAddress.length]);

  const fetchTransactions = async () => {
    if (!queryAddress) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/transactions?address=${queryAddress}&chainId=${chainId}&limit=50`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const result = await response.json();
      setItems(result.items ?? []);
      setLastUpdated(Date.now());
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch transactions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (queryAddress) {
      fetchTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryAddress, chainId]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(item => {
      const type = item.type.toLowerCase();
      if (filter === 'swaps') return type.includes('swap');
      if (filter === 'orders') return type.includes('order') || type.includes('place') || type.includes('cancel');
      if (filter === 'liquidity') return type.includes('liquidity') || type.includes('mint') || type.includes('burn');
      return true;
    });
  }, [items, filter]);

  // Stats
  const stats = useMemo(() => {
    const swaps = items.filter(i => i.type.toLowerCase().includes('swap')).length;
    const orders = items.filter(i => i.type.toLowerCase().includes('order') || i.type.toLowerCase().includes('place')).length;
    const success = items.filter(i => i.status === 'Success' || i.status === 'Confirmed').length;
    return { total: items.length, swaps, orders, successRate: items.length > 0 ? Math.round((success / items.length) * 100) : 0 };
  }, [items]);

  return (
    <div className="w-full max-w-5xl p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Transaction History</h2>
          <p className="text-sm text-zinc-400">
            Track your DEX activity on Tempo
            {lastUpdated && (
              <span className="text-zinc-500"> • Updated {Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))}s ago</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={queryAddress}
              onChange={(e) => setQueryAddress(e.target.value.trim())}
              placeholder="0x wallet address"
              className="w-72 max-w-full rounded-xl bg-black/40 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#00F3FF]/50 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={fetchTransactions}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00F3FF]/20 to-[#BC13FE]/20 text-white border border-white/10 hover:border-[#00F3FF]/50 transition-all text-sm font-semibold disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading
              </span>
            ) : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-500 mb-1">Total Txns</p>
          <p className="text-xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-500 mb-1">Swaps</p>
          <p className="text-xl font-bold text-[#00F3FF]">{stats.swaps}</p>
        </div>
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-500 mb-1">Orders</p>
          <p className="text-xl font-bold text-purple-400">{stats.orders}</p>
        </div>
        <div className="p-3 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-500 mb-1">Success Rate</p>
          <p className="text-xl font-bold text-emerald-400">{stats.successRate}%</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['all', 'swaps', 'orders', 'liquidity'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              filter === f
                ? 'bg-[#00F3FF]/20 text-[#00F3FF] border border-[#00F3FF]/30'
                : 'bg-black/20 text-zinc-400 border border-white/5 hover:text-white hover:bg-black/40'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-60">
                ({f === 'swaps' ? stats.swaps : f === 'orders' ? stats.orders : items.filter(i => i.type.toLowerCase().includes('liquidity') || i.type.toLowerCase().includes('mint')).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-center gap-3">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Transactions Table */}
      <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-black/40 border-b border-white/5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          <span className="col-span-4">Type</span>
          <span className="col-span-3">Amount</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-3">Transaction</span>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-white/5">
          {isLoading ? (
            <div className="p-4"><LoadingSkeleton /></div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-zinc-500">No transactions found</p>
              <p className="text-xs text-zinc-600 mt-1">Try a different address or filter</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const amountDisplay =
                item.amount && item.amount !== '0'
                  ? formatUnitsFixed(BigInt(item.amount), 6)
                  : '—';
              return (
                <div
                  key={`${item.hash}-${item.block}`}
                  className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-white/[0.02] transition-colors items-center"
                >
                  <div className="col-span-4">
                    <TypeBadge type={item.type} />
                  </div>
                  <div className="col-span-3 font-mono text-white">
                    {amountDisplay}
                  </div>
                  <div className="col-span-2">
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="col-span-3">
                    <a
                      href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#00F3FF] hover:text-[#00F3FF]/80 transition-colors font-mono text-xs"
                    >
                      {item.hash.slice(0, 8)}...{item.hash.slice(-6)}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
