'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';

type DexStats = {
  totalSwaps: number;
  totalVolumeUSDC: string;
  totalLiquidityEvents: number;
  uniqueTraders: number;
  scannedBlocks: number;
  latestBlock: string;
  updatedAt: number;
};

function useLiveDexStats() {
  const [stats, setStats] = useState<DexStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/dex-stats');
      if (res.ok) {
        const data: DexStats = await res.json();
        setStats(data);
      }
    } catch {
      // silently ignore and keep showing the last known value
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 20_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return { stats, loading };
}

function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.5" fill="#25c0f4" fillOpacity="0.08" />
      <circle cx="16" cy="16" r="10" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.7" fill="none" />
      <circle cx="16" cy="16" r="4.5" fill="#25c0f4" />
    </svg>
  );
}

export default function Home() {
  const navRef = useRef<HTMLElement>(null);
  const { stats, loading } = useLiveDexStats();

  useEffect(() => {
    const onScroll = () => {
      if (!navRef.current) return;
      if (window.scrollY > 20) {
        navRef.current.classList.add('nav-scrolled');
      } else {
        navRef.current.classList.remove('nav-scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090e1a] font-sans text-[#f1f5f9] antialiased">
      <style>{`
        .nav-scrolled { background: rgba(9,14,26,0.92) !important; backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .hero-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%,black 30%,transparent 80%); pointer-events: none; }
        .hero-glow { position: absolute; top: 10%; left: 50%; transform: translateX(-50%); width: 700px; height: 360px; background: radial-gradient(ellipse,rgba(37,192,244,.08) 0%,transparent 65%); pointer-events: none; }
        .line2 { display: block; color: transparent; -webkit-text-stroke: 1.5px rgba(255,255,255,.25); }
        .line3 { display: block; background: linear-gradient(90deg,#25c0f4,#7dd3fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      `}</style>

      <nav
        ref={navRef}
        className="fixed left-0 right-0 top-0 z-50 transition-all duration-300"
        style={{ background: 'transparent' }}
      >
        <div className="mx-auto flex h-[66px] max-w-[1140px] items-center px-4 md:px-7">
          <Link href="/" className="mr-auto flex select-none items-center gap-2.5">
            <LogoMark size={34} />
            <span className="text-[15px] font-extrabold tracking-tight text-[#f1f5f9]">Presto</span>
          </Link>
          <div className="mr-5 hidden gap-0.5 md:flex">
            {[['Swap', '/swap'], ['Pools', '/liquidity'], ['Bridge', '/bridge']].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#94a3b8] transition-all hover:bg-white/[0.04] hover:text-[#f1f5f9]"
              >
                {label}
              </Link>
            ))}
          </div>
          <Link
            href="/swap"
            className="rounded-lg bg-[#25c0f4] px-[18px] py-2 text-[13px] font-bold text-[#090e1a] transition-opacity hover:opacity-90"
          >
            Launch App
          </Link>
        </div>
      </nav>

      <section className="relative flex min-h-screen items-center overflow-hidden pb-20 pt-[120px]">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="relative z-10 mx-auto w-full max-w-[1140px] px-4 md:px-7 text-center">
          <div className="mb-7 inline-flex items-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#94a3b8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            Arc Testnet
          </div>
          <h1
            className="mb-6 font-black leading-none tracking-tight"
            style={{ fontSize: 'clamp(44px,7vw,80px)', letterSpacing: '-0.045em' }}
          >
            Presto
            <span className="line2">Swap. Bridge.</span>
            <span className="line3">Earn.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-[520px] text-[16px] leading-[1.7] text-[#94a3b8]">
            A clean, fast DEX built on Arc testnet. Instant swaps, stable liquidity pools, and cross chain USDC transfers in about 20 seconds.
          </p>
          <div className="mb-16 flex flex-wrap justify-center gap-3">
            <Link
              href="/swap"
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#25c0f4] px-8 py-3.5 text-[14px] font-extrabold text-[#090e1a] transition-all hover:-translate-y-px hover:opacity-90"
              style={{ boxShadow: '0 8px 28px rgba(37,192,244,0.20)' }}
            >
              Launch App
              <svg width="16" height="16" fill="none" stroke="#090e1a" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center rounded-[10px] border border-white/10 px-6 py-3.5 text-[14px] font-semibold text-[#94a3b8] transition-all hover:border-white/20 hover:text-[#f1f5f9]"
            >
              Read Docs
            </Link>
          </div>

          <div className="mx-auto grid max-w-[760px] grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 bg-[#141e30] md:grid-cols-4">
            {[
              { v: loading ? '—' : (stats?.totalVolumeUSDC ?? '$0'), l: 'Swap Volume' },
              { v: loading ? '—' : (stats?.totalLiquidityEvents ? `${stats.totalLiquidityEvents}` : '0'), l: 'Liquidity Adds' },
              { v: loading ? '—' : (stats?.totalSwaps ? `${stats.totalSwaps}` : '0'), l: 'Swaps' },
              { v: loading ? '—' : (stats?.uniqueTraders ? `${stats.uniqueTraders}` : '0'), l: 'Traders' },
            ].map(({ v, l }, i) => (
              <div key={i} className="border-b border-r border-white/[0.06] px-4 py-4 text-center last:border-r-0 odd:md:border-r even:[&:nth-child(2)]:border-r md:border-b-0">
                <div className="text-[17px] font-extrabold tracking-tight text-[#25c0f4] md:text-[20px]">{v}</div>
                <div className="mt-1 text-[10px] font-medium text-[#4b6280] md:text-[11px]">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-[1140px] px-4 md:px-7">
          <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#25c0f4]">What you get</div>
          <div className="mb-2 text-[clamp(24px,3.5vw,38px)] font-extrabold tracking-tight">Every surface you need.</div>
          <div className="mb-10 max-w-[480px] text-[14px] leading-[1.65] text-[#94a3b8]">
            Swap, pool, bridge, and track your portfolio. All from a single sidebar driven interface.
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { t: 'Token Swaps', d: 'Instant onchain execution against stable hub pools. No offchain order books and no hidden routing fees.' },
              { t: 'Cross Chain Bridge', d: 'Circle CCTP V2 moves USDC across Arc, Base, Ethereum, and Solana. Live fee estimates and retry support.' },
              { t: 'Liquidity Pools', d: 'Provide liquidity, manage positions, and earn trading fees on every swap through your pool.' },
            ].map(({ t, d }) => (
              <div key={t} className="rounded-[16px] border border-white/[0.06] bg-[#141e30] p-7">
                <div className="mb-3 text-[17px] font-extrabold tracking-tight text-[#f1f5f9]">{t}</div>
                <div className="text-[13px] leading-[1.65] text-[#94a3b8]">{d}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { t: 'Portfolio', d: 'Token balances, LP positions, and fee earnings. All in one dashboard.' },
              { t: 'Activity Feed', d: 'Complete history of swaps, liquidity events, and bridge transfers for your wallet.' },
              { t: 'Analytics', d: 'Onchain orderbook data and trade volume summaries on supported routes.' },
            ].map(({ t, d }) => (
              <div key={t} className="rounded-[16px] border border-white/[0.06] bg-[#141e30] p-7">
                <div className="mb-3 text-[17px] font-extrabold tracking-tight text-[#f1f5f9]">{t}</div>
                <div className="text-[13px] leading-[1.65] text-[#94a3b8]">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="border-b border-t border-white/[0.06] bg-[#0f172a] py-[60px]">
        <div className="mx-auto max-w-[1140px] px-4 md:px-7 text-center">
          <div className="mb-6 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#4b6280]">Bridge Supported Networks</div>
          <div className="flex flex-wrap justify-center gap-3">
            {['Arc Testnet', 'Base Sepolia', 'Ethereum Sepolia', 'Solana Devnet'].map((name) => (
              <div key={name} className="flex items-center rounded-[10px] border border-white/[0.06] bg-[#141e30] px-4 py-2.5">
                <span className="text-[13px] font-semibold text-[#f1f5f9]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-white/[0.06] py-9">
        <div className="mx-auto max-w-[1140px] space-y-6 px-4 md:px-7">
          <div className="flex items-center gap-3">
            <LogoMark size={26} />
            <span className="text-[13px] font-bold text-[#f1f5f9]">Presto</span>
          </div>

          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#4b6280]">Legal</p>
            <div className="mt-4 flex flex-wrap gap-6">
              <Link href="/docs#privacy-policy" className="text-[13px] text-[#cbd5e1] transition-colors hover:text-[#25c0f4]">
                Privacy Policy
              </Link>
              <Link href="/docs#terms-of-use" className="text-[13px] text-[#cbd5e1] transition-colors hover:text-[#25c0f4]">
                Terms of Use
              </Link>
              <Link href="/docs#cookie-policy" className="text-[13px] text-[#cbd5e1] transition-colors hover:text-[#25c0f4]">
                Cookie Policy
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-white/[0.06] pt-5">
            <div className="text-[11.5px] text-[#4b6280]">&copy; 2026 Presto. All rights reserved.</div>
            <div className="flex gap-4">
              {[
                ['Docs', '/docs'],
                ['GitHub', 'https://github.com/Emperoar07/Presto'],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="text-[12px] text-[#4b6280] transition-colors hover:text-[#25c0f4]">
                  {label}
                </Link>
              ))}
            </div>
            <div className="text-[11.5px] text-[#4b6280]">Built with love by 0xb</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
