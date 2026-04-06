'use client';

import { useMemo, useState } from 'react';
import { useTransactions } from '@/hooks/useApiQueries';

const SURF = '#1e293b';
const SURF_2 = '#263347';
const BDR = '1px solid rgba(255,255,255,0.07)';

type TxItem = {
  hash: string;
  block: string;
  type: string;
  status: string;
  amount: string;
};

function activityIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('swap')) return { icon: 'swap_horiz', bg: 'rgba(37,192,244,0.12)', color: '#25c0f4' };
  if (normalized.includes('liquidity') || normalized.includes('mint') || normalized.includes('burn')) return { icon: 'water', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };
  if (normalized.includes('bridge')) return { icon: 'swap_horizontal_circle', bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' };
  return { icon: 'receipt_long', bg: 'rgba(255,255,255,0.06)', color: '#94a3b8' };
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'swaps' | 'liquidity' | 'bridge'>('all');
  const { data: items = [], isLoading } = useTransactions();

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items as TxItem[];
    return (items as TxItem[]).filter((item) =>
      item.type.toLowerCase().includes(filter === 'swaps' ? 'swap' : filter)
    );
  }, [filter, items]);

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-[14px]" style={{ borderBottom: BDR }}>
          <p className="text-[14px] font-bold text-slate-100">Transaction History</p>
          <div className="flex gap-1 rounded-[10px] p-1" style={{ background: SURF_2 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'swaps', label: 'Swaps' },
              { key: 'liquidity', label: 'Liquidity' },
              { key: 'bridge', label: 'Bridge' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`rounded-[8px] px-[14px] py-[6px] text-[13px] font-semibold transition-all ${
                  filter === tab.key ? 'text-slate-100 shadow' : 'text-slate-500'
                }`}
                style={filter === tab.key ? { background: SURF } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && filteredItems.length === 0 ? (
          <div className="px-5 py-10 text-[13px] text-slate-500">Loading activity...</div>
        ) : filteredItems.length === 0 ? (
          <div className="px-5 py-10 text-[13px] text-slate-400">No transactions found for this wallet yet.</div>
        ) : (
          <div>
            {filteredItems.map((item) => {
              const visual = activityIcon(item.type);
              const success = item.status === 'Success' || item.status === 'Confirmed';

              return (
                <div
                  key={`${item.hash}-${item.block}`}
                  className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-[10px]"
                    style={{ background: visual.bg, color: visual.color }}
                  >
                    <span className="material-symbols-outlined text-[16px]">{visual.icon}</span>
                  </span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-slate-100">{item.type}</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">
                      {item.amount && item.amount !== '0' ? `Amount ${item.amount}` : `Block ${item.block}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[13px] font-bold ${success ? 'text-emerald-400' : item.status === 'Failed' ? 'text-rose-400' : 'text-amber-400'}`}>
                      {success ? 'Confirmed' : item.status}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {item.hash.slice(0, 6)}...{item.hash.slice(-4)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
