'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useChainId } from 'wagmi';
import { isTempoNativeChain } from '@/config/contracts';

// Lazy load heavy analytics component (includes recharts)
const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => <AnalyticsLoadingSkeleton />,
  }
);

function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Chart skeleton */}
      <div className="w-full h-64 rounded-2xl glass-panel animate-skeleton" />
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl glass-panel animate-skeleton" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-2xl glass-panel p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded-lg animate-skeleton" />
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const chainId = useChainId();
  const isTempoChain = isTempoNativeChain(chainId);

  if (!isTempoChain) {
    return (
      <main className="flex flex-col items-center px-4 py-10 md:py-14">
        <div className="w-full max-w-3xl rounded-2xl glass-panel p-8 text-center shadow-xl">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Analytics is only available on Tempo testnet right now. Arc uses the Activity page for live swaps and liquidity history instead.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/transactions"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-background-dark transition-colors hover:bg-primary/90"
            >
              Open Activity
            </Link>
            <Link
              href="/swap"
              className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
            >
              Back to Swap
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center px-4 py-10 md:py-14">
      <div className="w-full max-w-4xl flex flex-col gap-6 animate-slide-up">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Market summaries and chain-aware trading activity.</p>
        </div>
        <AnalyticsDashboard />
      </div>
    </main>
  );
}
