'use client';

import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => <TransactionsLoadingSkeleton />,
  }
);

function TransactionsLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="w-full h-64 rounded-2xl border border-white/10 bg-black/30 animate-skeleton" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-white/10 bg-black/30 animate-skeleton" />
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded-lg animate-skeleton" />
        ))}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <div className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Transactions</h1>
          <p className="text-zinc-400 mt-2">Recent activity and status for selected tokens.</p>
        </div>
        <AnalyticsDashboard initialOrderbookView="transactions" />
      </div>
    </div>
  );
}
