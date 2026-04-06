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
        {/* ── Volume by Pool ── */}
        <div className="flex flex-col rounded-[14px]" style={{ background: SURF, border: BDR, minHeight: 260 }}>
          <div className="px-5 pt-5 pb-4">
            <p className="text-[15px] font-bold text-slate-100">Volume by Pool</p>
          </div>
          <div className="flex flex-1 flex-col justify-end px-5 pb-4">
            {(() => {
              const poolVolumes = pools.map((p: { pair: string; vol24h: string; label: string }) => {
                const raw = Number.parseFloat((p.vol24h ?? '').replace(/[^0-9.]/g, '')) || 0;
                return { pair: p.pair, label: p.label, raw };
              });
              const maxVol = Math.max(...poolVolumes.map((p: { raw: number }) => p.raw), 1);
              return (
                <>
                  <div className="flex items-end gap-2" style={{ height: 120 }}>
                    {poolVolumes.map((p: { pair: string; raw: number }, i: number) => (
                      <div key={i} className="group relative flex-1">
                        <div
                          className="w-full rounded-t-[4px] transition-colors hover:!bg-[rgba(37,192,244,0.35)]"
                          style={{ height: `${Math.max((p.raw / maxVol) * 100, 4)}%`, background: 'rgba(37,192,244,0.22)' }}
                        />
                        <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-200 opacity-0 group-hover:opacity-100">
                          ${p.raw.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {poolVolumes.map((p: { pair: string; label: string }, i: number) => (
                      <p key={i} className="flex-1 text-center text-[10px] font-medium text-slate-500">{p.label}</p>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* ── Pool Activity panel ── */}
        <div className="flex flex-col rounded-[14px]" style={{ background: SURF, border: BDR, minHeight: 260 }}>
          <div className="px-5 pt-5 pb-3" style={{ borderBottom: BDR }}>
            <p className="text-[15px] font-bold text-slate-100">Pool Activity</p>
          </div>

          {loading && pools.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-slate-500">Loading...</div>
          ) : pools.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-slate-500">No pool data</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Table header - hidden on mobile */}
              <div
                className="hidden px-5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 md:grid"
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
                  className="flex items-center justify-between gap-3 px-4 py-3 md:grid md:px-5"
                  style={{ gridTemplateColumns: '1fr 100px 100px 60px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
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
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-100">{pair}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 md:hidden">{liquidity}</p>
                    </div>
                  </div>
                  <p className="hidden text-right text-[12px] font-semibold text-slate-300 md:block">{liquidity}</p>
                  <p className="hidden text-right text-[12px] font-semibold text-slate-300 md:block">{vol24h}</p>
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
