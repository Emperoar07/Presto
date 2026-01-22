'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const bpmStrings = [
    'BPM 72 · 88 · 96 · 108',
    'BPM 118 · 124 · 128 · 132',
    'BPM 140 · 148 · 156 · 162',
    'BPM 90 · 110 · 130 · 150',
    'BPM 100 · 112 · 126 · 138',
  ];
  const [showLoader, setShowLoader] = useState(true);
  const [bpmIndex, setBpmIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBpmIndex((prev) => (prev + 1) % bpmStrings.length);
    }, 280);
    const timeout = setTimeout(() => {
      setShowLoader(false);
    }, 5200);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-6">
      {showLoader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-black/70 px-10 py-12 text-center shadow-2xl">
            <div className="absolute inset-0 opacity-40">
              <div className="absolute -left-20 top-10 h-20 w-[140%] rounded-full bg-gradient-to-r from-[#00F3FF]/30 via-[#2E0249]/20 to-[#BC13FE]/30 blur-[8px]" />
              <div className="absolute -right-16 top-24 h-16 w-[140%] rounded-full bg-gradient-to-r from-[#BC13FE]/30 via-[#00F3FF]/20 to-[#2E0249]/30 blur-[8px]" />
              <div className="absolute left-1/2 top-1/2 h-24 w-[120%] -translate-x-1/2 rounded-full bg-gradient-to-r from-white/10 to-transparent blur-[12px]" />
            </div>
            <div className="relative">
              <div className="text-[11px] uppercase tracking-[0.4em] text-zinc-400">PrestoDEX Tempo</div>
              <div className="mt-5 text-3xl font-bold text-white">
                Warming the soundstage
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                calibrating liquidity pulses
              </div>
              <div className="mt-6 font-mono text-sm text-[#00F3FF]">
                {bpmStrings[bpmIndex]}
              </div>
              <div className="mt-6 flex items-center justify-center gap-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-8 rounded-full bg-gradient-to-r from-[#00F3FF] via-[#BC13FE] to-[#2E0249] opacity-70"
                    style={{
                      animation: `pulse ${0.9 + i * 0.12}s ease-in-out ${i * 0.1}s infinite`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/3 animate-pulse bg-gradient-to-r from-[#00F3FF] to-[#BC13FE]" />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Hero Section */}
      <div className="text-center animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Trade with <span className="bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] bg-clip-text text-transparent">confidence</span>
        </h1>
        <p className="text-zinc-400 max-w-md mx-auto">
          Lightning-fast stablecoin swaps on Tempo Network
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid w-full max-w-5xl text-center lg:grid-cols-3 lg:text-left gap-6 animate-slide-up">
        <Link
          href="/swap"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all duration-300 hover:border-[#00F3FF]/50 hover:bg-black/60 hover:shadow-[0_0_30px_rgba(0,243,255,0.15)] hover:-translate-y-1 card-hover btn-press"
        >
          <div className="w-10 h-10 rounded-xl bg-[#00F3FF]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-white flex items-center gap-2">
            Swap
            <span className="inline-block transition-transform group-hover:translate-x-1 text-[#00F3FF]">
              &rarr;
            </span>
          </h2>
          <p className="text-sm text-zinc-400">
            Swap stablecoins instantly with minimal slippage.
          </p>
        </Link>

        <Link
          href="/liquidity"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all duration-300 hover:border-[#BC13FE]/50 hover:bg-black/60 hover:shadow-[0_0_30px_rgba(188,19,254,0.15)] hover:-translate-y-1 card-hover btn-press"
        >
          <div className="w-10 h-10 rounded-xl bg-[#BC13FE]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5 text-[#BC13FE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-white flex items-center gap-2">
            Liquidity
            <span className="inline-block transition-transform group-hover:translate-x-1 text-[#BC13FE]">
              &rarr;
            </span>
          </h2>
          <p className="text-sm text-zinc-400">
            Provide liquidity and earn trading fees.
          </p>
        </Link>

        <Link
          href="/analytics"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all duration-300 hover:border-white/30 hover:bg-black/60 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:-translate-y-1 card-hover btn-press"
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-white flex items-center gap-2">
            Analytics
            <span className="inline-block transition-transform group-hover:translate-x-1 text-white">
              &rarr;
            </span>
          </h2>
          <p className="text-sm text-zinc-400">
            View market data and orderbook depth.
          </p>
        </Link>
      </div>
    </main>
  );
}
