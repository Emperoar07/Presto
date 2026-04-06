'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSwapPageStats } from '@/hooks/useApiQueries';

const SwapCardEnhanced = dynamic(
  () => import('@/components/swap/SwapCardEnhanced').then((m) => ({ default: m.SwapCardEnhanced })),
  { ssr: false, loading: () => <div className="h-[480px] w-full max-w-[381px] rounded-[14px] bg-[#1e293b] animate-pulse" /> }
);

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';

const USDC_COLOR = '#3b82f6';
const USDC_LABEL = 'US';

type PoolStat = {
  pair: string;
  token: string;
  color: string;
  label: string;
  liquidity: string;
  vol24h: string;
  swapCount: number;
  hasLiquidity: boolean;
};

export default function SwapPage() {
  const { dexStats, poolStats, loading } = useSwapPageStats();
  const pools: PoolStat[] = poolStats?.pools ?? [];

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex flex-col items-center gap-5 xl:flex-row xl:items-start">
        <div className="flex w-full justify-center xl:block xl:w-auto xl:flex-shrink-0">
          <SwapCardEnhanced />
        </div>

        <div className="w-full space-y-4 xl:flex-1" style={{ maxWidth: 580 }}>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: 'candlestick_chart',
                label: 'Total Volume',
                value: loading ? '--' : (dexStats?.totalVolumeUSDC ?? '$0'),
                sub: `${dexStats?.totalSwaps ?? 0} swaps`,
              },
              {
                icon: 'water',
                label: 'Total Liquidity',
                value: loading ? '--' : (poolStats?.totalLiquidityUsdc ?? '$0'),
                sub: `${pools.filter((p) => p.hasLiquidity).length} active pools`,
              },
            ].map(({ icon, label, value, sub }) => (
              <div key={label} className="rounded-[16px] px-5 py-5" style={{ background: SURF, border: BDR }}>
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>
                  {label}
                </p>
                <p className="text-[20px] font-extrabold leading-none tracking-tight text-slate-100">{value}</p>
                <p className="mt-1 text-[11px] font-semibold text-emerald-400">{sub}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Top Pools</p>
              <Link href="/liquidity" className="text-[12px] font-semibold text-[#25c0f4]">
                View all -&gt;
              </Link>
            </div>

            {loading && pools.length === 0 ? (
              <div className="px-5 py-6 text-center text-[13px] text-slate-500">Loading...</div>
            ) : pools.length === 0 ? (
              <div className="px-5 py-6 text-center text-[13px] text-slate-500">No pools found</div>
            ) : (
              <div>
                {pools.map(({ pair, color, label, liquidity, vol24h, swapCount, hasLiquidity }) => (
                  <div
                    key={pair}
                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] md:grid md:gap-3.5 md:px-5 md:py-3.5"
                    style={{ gridTemplateColumns: 'auto 1fr 120px 100px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-6 w-10 flex-shrink-0">
                        {[{ bg: color, lbl: label }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                          <div
                            key={idx}
                            className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                            style={{ background: ic.bg, left: idx === 0 ? 0 : 14, zIndex: idx === 0 ? 1 : 0, border: `2px solid ${SURF}` }}
                          >
                            {ic.lbl}
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 md:hidden">
                        <p className="text-[13px] font-bold text-slate-100">{pair}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{liquidity}</p>
                      </div>
                    </div>
                    <div className="hidden min-w-0 md:block">
                      <p className="text-[13px] font-bold text-slate-100">{pair}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Stable hub / 0.3%</p>
                    </div>
                    <div className="hidden text-right md:block">
                      <p className="text-[13px] font-semibold text-slate-100">{liquidity}</p>
                      <p className="text-[11px] text-slate-500">Liquidity</p>
                    </div>
                    <div className="text-right">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{
                          color: hasLiquidity ? '#34d399' : '#64748b',
                          background: hasLiquidity ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                        }}
                      >
                        {hasLiquidity ? `${swapCount} swaps` : 'Empty'}
                      </span>
                      <p className="mt-0.5 hidden text-[11px] text-slate-500 md:block">{vol24h}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
