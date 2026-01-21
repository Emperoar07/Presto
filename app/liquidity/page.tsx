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
    <div className="w-full rounded-2xl border border-white/10 bg-black/40 p-7 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-3 mb-7 p-2 rounded-xl bg-black/20 border border-white/5">
        <div className="flex-1 h-10 rounded-lg animate-skeleton" />
        <div className="flex-1 h-10 rounded-lg animate-skeleton" />
      </div>
      {/* Content */}
      <div className="space-y-4">
        <div className="h-6 w-40 animate-skeleton rounded" />
        <div className="p-5 rounded-xl bg-black/20 border border-white/5 space-y-4">
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
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6 animate-slide-up">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] bg-clip-text text-transparent">
            Liquidity
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Manage fee liquidity and place limit orders.</p>
        </div>
        <LiquidityCard />
      </div>
    </main>
  );
}
