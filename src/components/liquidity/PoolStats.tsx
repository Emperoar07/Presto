'use client';

import { useMemo } from 'react';
import { formatUnits } from 'viem';

interface PoolStatsProps {
  userTokenSymbol: string;
  validatorTokenSymbol: string;
  reserveUserToken: bigint | null;
  reserveValidatorToken: bigint | null;
  userTokenDecimals: number;
  validatorTokenDecimals: number;
  totalShares: bigint | null;
  userShares: bigint | null;
}

export function PoolStats({
  userTokenSymbol,
  validatorTokenSymbol,
  reserveUserToken,
  reserveValidatorToken,
  userTokenDecimals,
  validatorTokenDecimals,
  totalShares,
  userShares,
}: PoolStatsProps) {
  const formatCompactPercent = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0.00%';
    if (value >= 1000) return '999.99%+';
    return `${value.toFixed(2)}%`;
  };

  const formatMetric = (value: number, fractionDigits = 2) => {
    if (!Number.isFinite(value)) return '--';

    if (Math.abs(value) >= 1_000_000) {
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(value);
    }

    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    });
  };

  const poolSharePercent = useMemo(() => {
    if (!totalShares || totalShares === 0n || !userShares) return 0;
    return Number((userShares * 10000n) / totalShares) / 100;
  }, [totalShares, userShares]);

  const userReserveValue = useMemo(() => {
    if (!reserveUserToken) return 0;
    return Number(formatUnits(reserveUserToken, userTokenDecimals));
  }, [reserveUserToken, userTokenDecimals]);

  const validatorReserveValue = useMemo(() => {
    if (!reserveValidatorToken) return 0;
    return Number(formatUnits(reserveValidatorToken, validatorTokenDecimals));
  }, [reserveValidatorToken, validatorTokenDecimals]);

  const tvl = useMemo(() => {
    return userReserveValue + validatorReserveValue;
  }, [userReserveValue, validatorReserveValue]);

  const userReserveDisplay = useMemo(() => {
    return formatMetric(userReserveValue, 4);
  }, [userReserveValue]);

  const validatorReserveDisplay = useMemo(() => {
    return formatMetric(validatorReserveValue, 4);
  }, [validatorReserveValue]);

  const poolRatio = useMemo(() => {
    if (!reserveUserToken || !reserveValidatorToken || reserveUserToken === 0n) {
      return null;
    }
    if (userReserveValue === 0) return null;
    return validatorReserveValue / userReserveValue;
  }, [reserveUserToken, reserveValidatorToken, userReserveValue, validatorReserveValue]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">TVL</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">${formatMetric(tvl)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Your Share</p>
          <p className="mt-2 break-words text-xl font-bold tracking-tight text-primary sm:text-2xl">{formatCompactPercent(poolSharePercent)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Pool Ratio</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {poolRatio ? `1 ${userTokenSymbol} ~ ${poolRatio.toFixed(4)} ${validatorTokenSymbol}` : '--'}
          </p>
        </div>
      </div>

      <div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Reserve Breakdown</p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
              Live pool balances
            </span>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/40">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-start">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">User-side reserve</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{userTokenSymbol}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{userReserveDisplay}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Exact balance:
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                    {userReserveValue.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/40">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-start">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hub-side reserve</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{validatorTokenSymbol}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{validatorReserveDisplay}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Exact balance:
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                    {validatorReserveValue.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
