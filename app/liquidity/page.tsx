'use client';

import dynamic from 'next/dynamic';

const LiquidityCard = dynamic(
  () => import('@/components/liquidity/LiquidityCard').then((m) => m.LiquidityCard),
  {
    ssr: false,
    loading: () => <LiquidityLoadingSkeleton />,
  }
);

function LiquidityLoadingSkeleton() {
  return (
    <div className="w-full glass-panel rounded-2xl p-7 animate-fade-in">
      <div className="flex gap-3 mb-7 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5">
        <div className="flex-1 h-10 rounded-lg animate-skeleton" />
        <div className="flex-1 h-10 rounded-lg animate-skeleton" />
      </div>
      <div className="space-y-4">
        <div className="h-6 w-40 animate-skeleton rounded" />
        <div className="p-5 rounded-xl token-input-bg border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="h-4 w-24 animate-skeleton rounded" />
          <div className="h-10 animate-skeleton rounded" />
        </div>
        <div className="h-12 animate-skeleton rounded-xl" />
      </div>
    </div>
  );
}

export default function LiquidityPage() {
  return (
    <main className="flex flex-col items-center px-4 py-10 md:py-14">
      <div className="w-full max-w-6xl animate-slide-up">
        <LiquidityCard />
      </div>
    </main>
  );
}
