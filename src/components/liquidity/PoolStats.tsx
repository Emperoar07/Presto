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
        {[
          { label: 'TVL', value: `$${formatMetric(tvl)}`, cls: 'text-slate-100' },
          { label: 'Your Share', value: formatCompactPercent(poolSharePercent), cls: 'text-[#25c0f4]' },
          { label: 'Pool Ratio', value: poolRatio ? `1 ${userTokenSymbol} ~ ${poolRatio.toFixed(4)} ${validatorTokenSymbol}` : '--', cls: 'text-slate-100' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-[12px] p-4" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className={`mt-2 text-[20px] font-extrabold tracking-tight ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] p-4" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Reserve Breakdown</p>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
            Live pool balances
          </span>
        </div>
        <div className="grid gap-3">
          {[
            { side: 'User-side reserve', symbol: userTokenSymbol, display: userReserveDisplay, exact: userReserveValue },
            { side: 'Hub-side reserve', symbol: validatorTokenSymbol, display: validatorReserveDisplay, exact: validatorReserveValue },
          ].map(({ side, symbol, display, exact }) => (
            <div key={symbol} className="rounded-[10px] px-4 py-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-start">
                <div>
                  <p className="text-[11px] text-slate-500">{side}</p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-100">{symbol}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-[18px] font-bold tracking-tight text-slate-100">{display}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Exact balance:</p>
                  <p className="mt-0.5 break-all text-[11px] text-slate-500">
                    {exact.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
