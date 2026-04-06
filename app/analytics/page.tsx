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
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            label: 'All-time Volume',
            value: loading ? '--' : (stats?.totalVolumeUSDC ?? '$0'),
            sub: 'Since launch',
          },
          {
            label: 'All-time Trades',
            value: loading ? '--' : String(stats?.totalSwaps ?? 0),
            sub: `${stats?.totalSwaps ?? 0} total swaps`,
          },
          {
            label: 'Unique Traders',
            value: loading ? '--' : String(stats?.uniqueTraders ?? 0),
            sub: 'Wallets active on Arc',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-[16px] px-3 py-4 md:px-5 md:py-5" style={{ background: SURF, border: BDR }}>
            <p className="mb-1 text-[10px] font-medium text-slate-500 md:mb-1.5 md:text-[11px]">{label}</p>
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-slate-100 md:text-[20px]">{value}</p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-400 md:text-[11px]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
        <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
          <p className="text-[14px] font-bold text-slate-100">Pool Activity - Arc Hub AMM</p>
        </div>

        {loading && pools.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-slate-500">Loading pool data...</div>
        ) : pools.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-slate-500">No pool data available</div>
        ) : (
          <div>
            <div
              className="hidden px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 md:grid"
              style={{ gridTemplateColumns: 'auto 1fr 120px 120px 80px', borderBottom: BDR }}
            >
              <div className="w-10" />
              <div>Pool</div>
              <div>Liquidity</div>
              <div>Recent Volume</div>
              <div className="text-right">Swaps</div>
            </div>

            {pools.map(({ pair, color, label, liquidity, vol24h, swapCount, hasLiquidity }: {
              pair: string; color: string; label: string; liquidity: string;
              vol24h: string; swapCount: number; hasLiquidity: boolean;
            }) => (
              <div
                key={pair}
                className="flex items-center justify-between gap-3 px-4 py-3.5 md:grid md:gap-3.5 md:px-5"
                style={{ gridTemplateColumns: 'auto 1fr 120px 120px 80px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative flex h-6 w-10 flex-shrink-0">
                    {[{ bg: color, lbl: label }, { bg: '#3b82f6', lbl: 'US' }].map((ic, idx) => (
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
                <div className="hidden md:block">
                  <p className="text-[13px] font-bold text-slate-100">{pair}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{hasLiquidity ? 'Stable hub / active' : 'No liquidity'}</p>
                </div>
                <p className="hidden text-[13px] font-semibold text-slate-100 md:block">{liquidity}</p>
                <p className="hidden text-[13px] font-semibold text-slate-100 md:block">{vol24h}</p>
                <div className="text-right">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      color: hasLiquidity ? '#34d399' : '#64748b',
                      background: hasLiquidity ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                    }}
                  >
                    {swapCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
