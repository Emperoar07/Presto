'use client';

import { useEffect, useState } from 'react';
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
};

export function TransactionsExplorer() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [queryAddress, setQueryAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);

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
        `/api/transactions?address=${queryAddress}&chainId=${chainId}&limit=30`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const result = await response.json();
      setItems(result.items ?? []);
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

  return (
    <div className="w-full max-w-5xl p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Transactions</h2>
          <p className="text-sm text-zinc-400">Explore wallet activity on Tempo.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={queryAddress}
            onChange={(e) => setQueryAddress(e.target.value.trim())}
            placeholder="0x wallet address"
            className="w-64 max-w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#00F3FF]/50"
          />
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 rounded-xl bg-[#00F3FF]/20 text-[#00F3FF] border border-[#00F3FF]/50 hover:bg-[#00F3FF]/30 transition-all text-sm font-semibold"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="grid grid-cols-4 text-xs font-medium text-zinc-500 mb-3">
          <span>Type</span>
          <span>Amount</span>
          <span>Status</span>
          <span>Tx</span>
        </div>

        {isLoading ? (
          <div className="text-xs text-zinc-500 text-center py-8">Loading transactions...</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-8">No transactions</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const amountDisplay =
                item.amount && item.amount !== '0'
                  ? formatUnitsFixed(BigInt(item.amount), 6)
                  : '--';
              return (
                <div key={`${item.hash}-${item.block}`} className="grid grid-cols-4 text-xs text-zinc-300 border-b border-white/5 pb-2">
                  <span className={item.type.includes('Cancel') || item.status === 'Failed' ? 'text-red-400' : 'text-green-400'}>
                    {item.type}
                  </span>
                  <span className="font-mono">
                    {amountDisplay}
                  </span>
                  <span className={item.status === 'Cancelled' ? 'text-red-400' : 'text-emerald-400'}>
                    {item.status}
                  </span>
                  <a
                    href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 truncate"
                  >
                    {item.hash.slice(0, 6)}...
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
