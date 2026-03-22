'use client';

import type { BridgeNetworkKey, BridgeStatusCard, BridgeSummary, EstimateSummary } from './types';
import { formatUsd, getExplorerBase } from './constants';

export function BridgeEstimatePanel({
  bridgeStatusCard,
  statusMessage,
  errorMessage,
  estimate,
  bridgeResult,
  sourceKey,
  destinationKey,
  estimatedReceiveAmount,
  exactAmountMode,
  onExactAmountModeChange,
}: {
  bridgeStatusCard: BridgeStatusCard | null;
  statusMessage: string | null;
  errorMessage: string | null;
  estimate: EstimateSummary | null;
  bridgeResult: BridgeSummary | null;
  sourceKey: BridgeNetworkKey;
  destinationKey: BridgeNetworkKey;
  estimatedReceiveAmount: string;
  exactAmountMode: boolean;
  onExactAmountModeChange: (v: boolean) => void;
}) {
  const hasBridgeActivity = Boolean(
    statusMessage || errorMessage || estimate || bridgeResult,
  );

  // ---- Fee computation ----
  let totalUsdc = 0;
  let nativeGasEntries: { token: string; amount: number }[] = [];

  if (estimate) {
    const protocolTotal = estimate.fees.reduce(
      (sum, fee) => sum + Number(fee.amount ?? 0), 0,
    );

    const gasByToken = new Map<string, number>();
    for (const g of estimate.gasFees) {
      if (!g.fees?.fee) continue;
      const feeStr = g.fees.fee;
      const value = feeStr.includes('.')
        ? Number(feeStr)
        : Number(BigInt(feeStr)) / 10 ** (g.token === 'SOL' ? 9 : 18);
      gasByToken.set(g.token, (gasByToken.get(g.token) ?? 0) + value);
    }

    const usdcGas = gasByToken.get('USDC') ?? 0;
    totalUsdc = protocolTotal + usdcGas;
    gasByToken.delete('USDC');

    nativeGasEntries = [...gasByToken.entries()].map(([token, val]) => ({ token, amount: val }));
  }

  const hasEstimateFees = estimate && (totalUsdc > 0 || nativeGasEntries.length > 0);

  return (
    <>
      {/* ---- Status card (success / error / pending) ---- */}
      {bridgeStatusCard ? (
        <div className="mt-3 rounded-[14px] border border-white/10 bg-[#151f33] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                bridgeStatusCard.state === 'success'
                  ? 'bg-emerald-400'
                  : bridgeStatusCard.state === 'error'
                    ? 'bg-rose-400'
                    : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              {bridgeStatusCard.state === 'success'
                ? 'Success'
                : bridgeStatusCard.state === 'error'
                  ? 'Failed'
                  : 'Pending'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-300">{bridgeStatusCard.message}</p>
        </div>
      ) : null}

      {/* ---- Main progress panel ---- */}
      {hasBridgeActivity ? (
        <div className="mt-3 rounded-[14px] border border-white/10 bg-[#151f33] p-3 space-y-3">
          {/* Status message */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bridge progress</p>
            <p className="mt-1 text-xs text-slate-300">
              {statusMessage ?? (errorMessage ? 'Bridge needs attention.' : 'Waiting for bridge activity.')}
            </p>
          </div>

          {/* Error message */}
          {errorMessage ? <p className="text-xs text-rose-300">{errorMessage}</p> : null}

          {/* Fee breakdown + receive amount */}
          {estimate ? (
            <div className="rounded-xl border border-white/5 bg-[#0d1829] px-3 py-2.5 space-y-2.5">
              {/* You receive row */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">You receive</span>
                <span className="text-[12px] font-semibold text-emerald-400">{estimatedReceiveAmount} USDC</span>
              </div>

              {/* Divider */}
              <div className="border-t border-white/5" />

              {/* Fee rows */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">Fees</p>
                {hasEstimateFees ? (
                  <div className="space-y-1">
                    {totalUsdc > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Protocol + gas</span>
                        <span className="text-[11px] font-medium text-slate-200">{totalUsdc.toFixed(totalUsdc >= 1 ? 2 : 6)} USDC</span>
                      </div>
                    ) : null}
                    {nativeGasEntries.map(({ token, amount }) => (
                      <div key={token} className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Network gas</span>
                        <span className="text-[11px] font-medium text-slate-200">
                          {amount < 0.000001 ? '<0.000001' : amount.toFixed(6)} {token}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-400">No fees</p>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-white/5" />

              {/* Exact amount toggle */}
              <button
                type="button"
                onClick={() => onExactAmountModeChange(!exactAmountMode)}
                className="flex w-full items-center justify-between group"
              >
                <div className="text-left">
                  <span className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">
                    Send exact amount
                  </span>
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    {exactAmountMode
                      ? 'Fees added on top — recipient gets your entered amount'
                      : 'Fees deducted from amount — recipient gets less'}
                  </p>
                </div>
                <div
                  className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${
                    exactAmountMode ? 'bg-primary' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow transition-transform ${
                      exactAmountMode ? 'translate-x-[16px]' : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>
            </div>
          ) : null}

          {/* Transaction links */}
          {bridgeResult?.steps?.some((step) => step.txHash) ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">Transactions</p>
              <div className="flex flex-wrap gap-1.5">
                {bridgeResult.steps
                  .filter((step) => step.txHash)
                  .map((step, index) => {
                    const stepName = step.name ?? step.action ?? `Step ${index + 1}`;
                    const stepChainKey =
                      stepName.toLowerCase() === 'mint'
                        ? destinationKey
                        : sourceKey;
                    const explorerBase = getExplorerBase(stepChainKey);

                    return (
                      <a
                        key={`${stepName}-${index}`}
                        href={`${explorerBase}${step.txHash}${stepChainKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#132238] px-2.5 py-1 text-[10px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        <span
                          className={`inline-flex h-1.5 w-1.5 rounded-full ${
                            step.state === 'success' ? 'bg-emerald-400' : step.state === 'error' ? 'bg-rose-400' : 'bg-slate-500'
                          }`}
                        />
                        <span className="capitalize">{stepName}</span>
                        <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                      </a>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
