import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-zinc-500">
        Loading analytics...
      </div>
    ),
  }
);

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="mt-2 text-sm text-zinc-400">Orderbook snapshots and recent activity.</p>
        </div>
        <AnalyticsDashboard />
      </div>
    </main>
  );
}
