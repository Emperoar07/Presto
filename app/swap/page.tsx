import { SwapCardEnhanced } from "@/components/swap/SwapCardEnhanced";

export default function SwapPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Swap</h1>
          <p className="mt-2 text-sm text-zinc-400">Fast, simple stablecoin swaps on Tempo.</p>
        </div>
        <SwapCardEnhanced />
      </div>
    </main>
  );
}
