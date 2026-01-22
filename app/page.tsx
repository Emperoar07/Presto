'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const LandingLoader = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-black text-white selection:bg-cyan-500 selection:text-black">
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000 ${
          loading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute inset-0 z-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 w-full max-w-3xl h-64 flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 1000 200" className="w-full h-full drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
            <defs>
              <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(34, 211, 238, 0)" />
                <stop offset="50%" stopColor="rgba(168, 85, 247, 0.5)" />
                <stop offset="90%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#fff" />
              </linearGradient>

              <mask id="lineMask">
                <rect x="0" y="0" width="1000" height="200" fill="black" />
                <rect x="-1000" y="0" width="1000" height="200" fill="white" className="animate-scan" />
              </mask>
            </defs>

            <path
              d="M0,100 L200,100 L230,40 L260,160 L290,100 L500,100 L530,20 L560,180 L590,100 L800,100 L830,50 L860,150 L890,100 L1000,100"
              fill="none"
              stroke="url(#pulseGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-dash"
            />

            <circle cx="0" cy="100" r="4" fill="#fff" className="animate-dot drop-shadow-[0_0_10px_white]" />
          </svg>
        </div>

        <div className="z-10 mt-4 text-center">
          <h1 className="text-3xl font-bold tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            PRESTO<span className="text-white font-light">DEX</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="block w-2 h-2 rounded-full bg-green-500 animate-ping" />
            <p className="text-xs text-gray-500 tracking-widest uppercase">System Tempo: 128 BPM</p>
          </div>
        </div>
      </div>

      <div className={`transition-all duration-1000 ${loading ? 'blur-sm scale-95 opacity-0' : 'blur-0 scale-100 opacity-100'}`}>
        {children}
      </div>

      <style jsx>{`
        .animate-dash {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: dash 2.5s linear infinite;
        }

        .animate-dot {
          offset-path: path("M0,100 L200,100 L230,40 L260,160 L290,100 L500,100 L530,20 L560,180 L590,100 L800,100 L830,50 L860,150 L890,100 L1000,100");
          animation: moveDot 2.5s linear infinite;
        }

        .animate-scan {
          animation: scan 2.5s linear infinite;
        }

        @keyframes dash {
          0% {
            stroke-dashoffset: 1000;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes moveDot {
          0% {
            offset-distance: 0%;
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
          }
        }

        @keyframes scan {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(2000px);
          }
        }
      `}</style>
    </div>
  );
};

export default function Home() {
  return (
    <LandingLoader>
      <main className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-6">
        <div className="text-center animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Trade with{' '}
            <span className="bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] bg-clip-text text-transparent">confidence</span>
          </h1>
          <p className="text-zinc-400 max-w-md mx-auto">Lightning-fast stablecoin swaps on Tempo Network</p>
        </div>

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
              <span className="inline-block transition-transform group-hover:translate-x-1 text-[#00F3FF]">&rarr;</span>
            </h2>
            <p className="text-sm text-zinc-400">Swap stablecoins instantly with minimal slippage.</p>
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
              <span className="inline-block transition-transform group-hover:translate-x-1 text-[#BC13FE]">&rarr;</span>
            </h2>
            <p className="text-sm text-zinc-400">Provide liquidity and earn trading fees.</p>
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
              <span className="inline-block transition-transform group-hover:translate-x-1 text-white">&rarr;</span>
            </h2>
            <p className="text-sm text-zinc-400">View market data and orderbook depth.</p>
          </Link>
        </div>
      </main>
    </LandingLoader>
  );
}
