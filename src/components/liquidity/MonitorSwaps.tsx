'use client';

import * as React from 'react';
import { Hooks } from '@/lib/tempo';
import { formatUnits } from 'viem';

interface MonitorSwapsProps {
  userToken: string;
  validatorToken: string;
}

export function MonitorSwaps({ userToken, validatorToken }: MonitorSwapsProps) {
  const [swaps, setSwaps] = React.useState<Array<{ amountIn: string; amountOut: string; revenue: string }>>([]);

  Hooks.amm.useWatchFeeSwap({
    userToken: userToken as `0x${string}`,
    validatorToken: validatorToken as `0x${string}`,
    onLogs(logs: unknown[]) {
      const next = logs
        .map((log) => (log as { args?: { amountIn?: bigint; amountOut?: bigint } }).args)
        .filter((args): args is { amountIn: bigint; amountOut: bigint } => !!args?.amountIn && !!args?.amountOut)
        .map((args) => ({
          amountIn: formatUnits(args.amountIn, 6),
          amountOut: formatUnits(args.amountOut, 6),
          revenue: formatUnits((args.amountIn * 30n) / 10000n, 6),
        }));

      if (next.length > 0) setSwaps((prev) => [...prev, ...next]);
    },
  });

  return (
    <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Swap Monitor</p>
          <h3 className="mt-1 text-[15px] font-extrabold text-slate-100">Recent fee swaps</h3>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
          {swaps.length} tracked
        </span>
      </div>

      {swaps.length === 0 ? (
        <div className="mt-4 rounded-[10px] px-4 py-8 text-center text-[13px] text-slate-500" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
          Fee swap activity will appear here once this pool starts processing routed swaps.
        </div>
      ) : (
        <div className="mt-4 space-y-2 max-h-52 overflow-y-auto pr-2">
          {swaps.map((swap, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-[12px]"
              style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="min-w-0 truncate font-mono text-slate-400">
                {swap.amountIn} to {swap.amountOut}
              </span>
              <span className="shrink-0 font-bold text-emerald-400">
                +{swap.revenue} Rev
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
