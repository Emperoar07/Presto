'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getExplorerTxUrl } from '@/lib/explorer';

type ActivityItem = {
  hash: string;
  type: string;
  status: string;
  block: string;
};

type ActivityResponse = {
  items?: ActivityItem[];
  notice?: string | null;
  networkLabel?: string;
};

export function PortfolioActivityFeed({
  address,
  chainId,
}: {
  address: `0x${string}`;
  chainId: number;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/transactions?address=${address}&chainId=${chainId}&limit=4`)
      .then((r) => r.json())
      .then((data: ActivityResponse) => {
        setItems(data.items ?? []);
        setNotice(data.notice ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [address, chainId]);

  const txIcon: Record<string, string> = {
    swap: 'swap_horiz',
    order: 'candlestick_chart',
    liquidity: 'water_drop',
    mint: 'add_circle',
    burn: 'remove_circle',
    cancel: 'cancel',
  };

  const getIcon = (type: string) => {
    const lower = type.toLowerCase();
    for (const [key, icon] of Object.entries(txIcon)) {
      if (lower.includes(key)) return icon;
    }
    return 'receipt_long';
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Activity
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Recent transactions</h3>
        </div>
        <Link href="/transactions" className="text-sm font-semibold text-primary transition-colors hover:text-primary/80">
          View all
        </Link>
      </div>

      {notice && (
        <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {notice}
        </div>
      )}

      {!loaded ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          No recent transactions yet on this network.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <a
              key={item.hash}
              href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-950/40 dark:hover:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[18px]">{getIcon(item.type)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.type}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Block {item.block}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {item.hash.slice(0, 6)}...{item.hash.slice(-4)}
                </p>
                <p
                  className={`mt-1 text-[10px] font-bold uppercase ${
                    item.status === 'Success' || item.status === 'Confirmed'
                      ? 'text-green-600 dark:text-green-500'
                      : item.status === 'Failed'
                        ? 'text-red-500'
                        : 'text-amber-500'
                  }`}
                >
                  {item.status}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
