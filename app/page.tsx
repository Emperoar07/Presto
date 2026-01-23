'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PrestoDexMotionStaffLogo } from '@/components/common/PrestoDexMotionStaffLogo';

const LandingLoader = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      {/* Loading Screen */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-700 ${
          loading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col items-center">
          <div className="animate-float">
            <PrestoDexMotionStaffLogo width={400} height={130} withWordmark />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-700 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.9;
          }
          50% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
        .animate-float {
          animation: float 2s ease-in-out infinite;
          filter: drop-shadow(0 0 25px rgba(0, 243, 255, 0.3));
        }
      `}</style>
    </div>
  );
};

// Glass Card Component for landing page
const GlassCard = ({
  href,
  icon,
  title,
  description,
  accentColor,
  delay = 0,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  delay?: number;
}) => (
  <Link
    href={href}
    className="group relative rounded-3xl overflow-hidden transition-all duration-500 hover:-translate-y-2"
    style={{ animationDelay: `${delay}ms` }}
  >
    {/* Glass background with gradient border */}
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-2xl" />
    <div
      className="absolute inset-[1px] rounded-3xl bg-black/60 backdrop-blur-xl"
      style={{
        background: `linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 100%)`,
      }}
    />

    {/* Animated gradient border */}
    <div
      className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      style={{
        background: `linear-gradient(135deg, ${accentColor}40 0%, transparent 50%, ${accentColor}20 100%)`,
      }}
    />

    {/* Glow effect on hover */}
    <div
      className="absolute -inset-1 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10"
      style={{ background: `${accentColor}30` }}
    />

    {/* Content */}
    <div className="relative z-10 p-8">
      {/* Icon container with liquid glass effect */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"
        style={{
          background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}05 100%)`,
          border: `1px solid ${accentColor}30`,
          boxShadow: `0 0 20px ${accentColor}20, inset 0 0 20px ${accentColor}10`,
        }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>

      <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-3">
        {title}
        <span
          className="inline-block transition-all duration-300 group-hover:translate-x-2 opacity-60 group-hover:opacity-100"
          style={{ color: accentColor }}
        >
          &rarr;
        </span>
      </h2>
      <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-8 right-8 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
        }}
      />
    </div>
  </Link>
);

export default function Home() {
  return (
    <LandingLoader>
      <main className="relative flex flex-col items-center justify-center min-h-screen gap-12 px-6 py-20 overflow-hidden bg-black text-white">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Gradient orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#00F3FF]/10 blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#BC13FE]/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Hero Section */}
        <div className="relative z-10 text-center animate-fade-in max-w-3xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <PrestoDexMotionStaffLogo width={320} height={110} withWordmark />
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Trade with{' '}
            <span className="bg-gradient-to-r from-[#00F3FF] via-[#BC13FE] to-[#00F3FF] bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              confidence
            </span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Lightning-fast stablecoin swaps on Tempo Network with deep liquidity and minimal slippage
          </p>
        </div>

        {/* Glass Cards Grid */}
        <div className="relative z-10 grid w-full max-w-5xl lg:grid-cols-3 gap-6 animate-slide-up">
          <GlassCard
            href="/swap"
            accentColor="#00F3FF"
            delay={0}
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            title="Swap"
            description="Swap stablecoins instantly with minimal slippage and the best rates across pools."
          />

          <GlassCard
            href="/liquidity"
            accentColor="#BC13FE"
            delay={100}
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            title="Liquidity"
            description="Provide liquidity and earn trading fees from every swap in the pool."
          />

          <GlassCard
            href="/analytics"
            accentColor="#FFFFFF"
            delay={200}
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="Analytics"
            description="View market data, orderbook depth, and real-time trading activity."
          />
        </div>

        {/* Stats Section - Glass style */}
        <div className="relative z-10 flex flex-wrap justify-center gap-8 mt-8">
          <div className="flex flex-col items-center px-8 py-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
            <span className="text-3xl font-bold text-white">$1M+</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Volume</span>
          </div>
          <div className="flex flex-col items-center px-8 py-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
            <span className="text-3xl font-bold text-[#00F3FF]">0.01%</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Slippage</span>
          </div>
          <div className="flex flex-col items-center px-8 py-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
            <span className="text-3xl font-bold text-[#BC13FE]">24/7</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Uptime</span>
          </div>
        </div>

        {/* Gradient animation keyframes */}
        <style jsx>{`
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient {
            animation: gradient 4s linear infinite;
          }
        `}</style>
      </main>
    </LandingLoader>
  );
}
