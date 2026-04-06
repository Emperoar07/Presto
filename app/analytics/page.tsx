'use client';

import dynamic from 'next/dynamic';
import { useChainId } from 'wagmi';
import { isTempoNativeChain } from '@/config/contracts';
import { useSwapPageStats } from '@/hooks/useApiQueries';

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  { ssr: false, loading: () => null }
);

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AnalyticsPage() {
  const chainId = useChainId();
  const isTempoChain = isTempoNativeChain(chainId);
  const { dexStats: stats, poolStats, loading } = useSwapPageStats();

  if (isTempoChain) {
    return (
      <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
        <AnalyticsDashboard />
      </div>
    );
  }

  const pools = poolStats?.pools ?? [];

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      {/* ── Page header ── */}
      <h1 className="mb-5 text-[20px] font-extrabold tracking-tight text-slate-100 md:text-[24px]">Analytics</h1>

      {/* ── Stat cards row ── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: 'All-time Volume',
            value: loading ? '--' : (stats?.totalVolumeUSDC ?? '$0'),
            sub: 'Since launch',
          },
          {
            label: 'All-time Trades',
            value: loading ? '--' : Number(stats?.totalSwaps ?? 0).toLocaleString(),
            sub: `${pools.filter((p: { hasLiquidity: boolean }) => p.hasLiquidity).length} active pools`,
          },
          {
            label: 'Unique Traders',
            value: loading ? '--' : Number(stats?.uniqueTraders ?? 0).toLocaleString(),
            sub: 'All time',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-[14px] px-5 py-5" style={{ background: SURF, border: BDR }}>
            <p className="mb-2 text-[11px] font-medium tracking-wide text-slate-500">{label}</p>
            <p className="text-[26px] font-extrabold leading-none tracking-tight text-slate-100">{value}</p>
            <p className="mt-2 text-[11px] font-semibold text-emerald-400">&#9650; {sub}</p>
          </div>
        ))}
      </div>

      {/* ── Two-column panels ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Volume (7d) placeholder ── */}
        <div className="flex flex-col rounded-[14px]" style={{ background: SURF, border: BDR, minHeight: 260 }}>
          <div className="px-5 pt-5 pb-4">
            <p className="text-[15px] font-bold text-slate-100">Volume (7d)</p>
          </div>
          <div className="flex flex-1 flex-col justify-end px-5 pb-4">
            {/* Bar chart placeholder */}
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {[0.3, 0.5, 0.25, 0.7, 0.45, 0.6, 0.35].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h * 100}%`, background: 'rgba(37,192,244,0.18)' }} />
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {DAYS.map((d) => (
                <p key={d} className="flex-1 text-center text-[10px] font-medium text-slate-500">{d}</p>
              ))}
            </div>
          </div>
        </div>

        {/* ── Pool Activity panel ── */}
        <div className="flex flex-col rounded-[14px]" style={{ background: SURF, border: BDR, minHeight: 260 }}>
          <div className="px-5 pt-5 pb-3" style={{ borderBottom: BDR }}>
            <p className="text-[15px] font-bold text-slate-100">Pool Activity &mdash; Arc Hub AMM</p>
          </div>

          {loading && pools.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-slate-500">Loading...</div>
          ) : pools.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-slate-500">No pool data</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Table header */}
              <div
                className="grid px-5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                style={{ gridTemplateColumns: '1fr 100px 100px 60px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div>Pool</div>
                <div className="text-right">Liquidity</div>
                <div className="text-right">Volume</div>
                <div className="text-right">Status</div>
              </div>

              {/* Pool rows */}
              {pools.map(({ pair, color, label, liquidity, vol24h, hasLiquidity }: {
                pair: string; color: string; label: string; liquidity: string;
                vol24h: string; swapCount: number; hasLiquidity: boolean;
              }) => (
                <div
                  key={pair}
                  className="grid items-center px-5 py-3"
                  style={{ gridTemplateColumns: '1fr 100px 100px 60px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-5 w-8 flex-shrink-0">
                      {[{ bg: color, lbl: label }, { bg: '#3b82f6', lbl: 'US' }].map((ic, idx) => (
                        <div
                          key={idx}
                          className="absolute flex h-5 w-5 items-center justify-center rounded-full text-[7px] font-extrabold text-white"
                          style={{ background: ic.bg, left: idx === 0 ? 0 : 11, zIndex: idx === 0 ? 1 : 0, border: `1.5px solid ${SURF}` }}
                        >
                          {ic.lbl}
                        </div>
                      ))}
                    </div>
                    <p className="text-[13px] font-semibold text-slate-100">{pair}</p>
                  </div>
                  <p className="text-right text-[12px] font-semibold text-slate-300">{liquidity}</p>
                  <p className="text-right text-[12px] font-semibold text-slate-300">{vol24h}</p>
                  <div className="text-right">
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: hasLiquidity ? '#34d399' : '#64748b' }}
                    >
                      {hasLiquidity ? 'Active' : 'Empty'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
