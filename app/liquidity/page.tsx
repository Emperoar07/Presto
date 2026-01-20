import dynamic from 'next/dynamic';

const LiquidityCard = dynamic(
  () => import('@/components/liquidity/LiquidityCard').then((m) => m.LiquidityCard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-zinc-500">
        Loading liquidity tools...
      </div>
    ),
  }
);

export default function LiquidityPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            Liquidity
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Manage fee liquidity and place limit orders.</p>
        </div>
        <LiquidityCard />
      </div>
    </main>
  );
}
