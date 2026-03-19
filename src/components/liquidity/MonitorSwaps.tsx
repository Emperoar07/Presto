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
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Swap Monitor
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Recent fee swaps</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
          {swaps.length} tracked
        </span>
      </div>

      {swaps.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          Fee swap activity will appear here once this pool starts processing routed swaps.
        </div>
      ) : (
        <div className="mt-4 space-y-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
          {swaps.map((swap, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.05]"
            >
              <span className="min-w-0 truncate font-mono text-slate-600 dark:text-slate-300">
                {swap.amountIn} to {swap.amountOut}
              </span>
              <span className="shrink-0 font-bold text-emerald-600 dark:text-green-400">
                +{swap.revenue} Rev
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
