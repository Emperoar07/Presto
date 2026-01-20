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
          revenue: formatUnits(args.amountIn * 30n / 10000n, 6),
        }));

      if (next.length > 0) setSwaps((prev) => [...prev, ...next]);
    },
  });

  if (swaps.length === 0) return null;

  return (
    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-sm space-y-3 mt-4">
      <h3 className="font-bold text-white">Recent Fee Swaps</h3>
      <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
        {swaps.map((swap, i) => (
          <div key={i} className="flex justify-between text-xs text-zinc-300 border-b border-white/5 pb-1 last:border-0">
            <span className="font-mono">{swap.amountIn} → {swap.amountOut}</span>
            <span className="text-green-400 font-bold">+{swap.revenue} Rev</span>
          </div>
        ))}
      </div>
    </div>
  );
}
