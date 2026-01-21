'use client';

import dynamic from 'next/dynamic';

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
      <div className="w-full h-64 rounded-2xl border border-white/10 bg-black/30 animate-skeleton" />
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-white/10 bg-black/30 animate-skeleton" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded-lg animate-skeleton" />
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl flex flex-col gap-6 animate-slide-up">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="mt-2 text-sm text-zinc-400">Orderbook snapshots and recent activity.</p>
        </div>
        <AnalyticsDashboard />
      </div>
    </main>
  );
}
