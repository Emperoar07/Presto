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
  const hasBridgeActivity = Boolean(statusMessage || errorMessage || estimate || bridgeResult);

  let totalUsdc = 0;
  let nativeGasEntries: { token: string; amount: number }[] = [];

  if (estimate) {
    const protocolTotal = estimate.fees.reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0);
    const gasByToken = new Map<string, number>();

    for (const g of estimate.gasFees) {
      if (!g.fees?.fee) continue;
      const feeStr = g.fees.fee;
      const value =
        feeStr.includes('.') ? Number(feeStr) : Number(BigInt(feeStr)) / 10 ** (g.token === 'SOL' ? 9 : 18);
      gasByToken.set(g.token, (gasByToken.get(g.token) ?? 0) + value);
    }

    const usdcGas = gasByToken.get('USDC') ?? 0;
    totalUsdc = protocolTotal + usdcGas;
    gasByToken.delete('USDC');
    nativeGasEntries = [...gasByToken.entries()].map(([token, amount]) => ({ token, amount }));
  }

  const hasEstimateFees = estimate && (totalUsdc > 0 || nativeGasEntries.length > 0);

  if (!hasBridgeActivity) return null;

  return (
    <div
      className="mt-3 overflow-hidden rounded-[12px]"
      style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* ── Status bar ── */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span
          className={`inline-flex h-[6px] w-[6px] flex-shrink-0 rounded-full ${
            bridgeStatusCard?.state === 'success'
              ? 'bg-emerald-400'
              : bridgeStatusCard?.state === 'error'
                ? 'bg-rose-400'
                : 'bg-amber-400 animate-pulse'
          }`}
        />
        <span className="flex-1 truncate text-[11px] text-slate-400">
          {statusMessage ?? (errorMessage ? 'Bridge needs attention.' : 'Preparing the transfer...')}
        </span>
        {(estimate || bridgeStatusCard) ? (
          <span
            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              bridgeStatusCard?.state === 'error'
                ? 'text-rose-300'
                : bridgeStatusCard?.state === 'success'
                  ? 'text-emerald-300'
                  : 'text-slate-200'
            }`}
            style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {estimate ? (totalUsdc > 0 ? formatUsd(totalUsdc.toString()) : '$0.0000') : bridgeStatusCard?.state ?? 'Live'}
          </span>
        ) : null}
      </div>

      {/* ── Error message ── */}
      {errorMessage ? (
        <div className="mx-3 mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      {/* ── Bridge status card ── */}
      {bridgeStatusCard ? (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-white/5 bg-[#121a2a] px-2.5 py-1.5">
          <span
            className={`inline-flex h-[5px] w-[5px] rounded-full ${
              bridgeStatusCard.state === 'success'
                ? 'bg-emerald-400'
                : bridgeStatusCard.state === 'error'
                  ? 'bg-rose-400'
                  : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-[11px] text-slate-300">{bridgeStatusCard.message}</span>
        </div>
      ) : null}

      {/* ── Ticker row: Receive | Fee | Exact toggle ── */}
      {estimate ? (
        <div className="flex items-center gap-4 px-3 py-2">
          <div className="flex items-baseline gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Receive</span>
            <span className="text-[12px] font-semibold text-emerald-400">{estimatedReceiveAmount}</span>
            <span className="text-[9px] text-slate-500">USDC</span>
          </div>
          <div className="h-3.5 w-px bg-white/[0.06]" />
          <div className="flex items-baseline gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Fee</span>
            <span className="text-[12px] font-semibold text-slate-100">
              {hasEstimateFees && totalUsdc > 0 ? totalUsdc.toFixed(totalUsdc >= 1 ? 2 : 6) : '0'}
            </span>
            <span className="text-[9px] text-slate-500">USDC</span>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onExactAmountModeChange(!exactAmountMode)}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <span className="text-[9px] font-semibold text-slate-500">Exact</span>
            <div
              className={`relative h-4 w-7 rounded-full transition-colors ${exactAmountMode ? 'bg-primary' : 'bg-slate-600'}`}
            >
              <div
                className="absolute top-[2px] h-3 w-3 rounded-full bg-white transition-[left]"
                style={{ left: exactAmountMode ? 12 : 2 }}
              />
            </div>
          </button>
        </div>
      ) : null}

      {/* ── Native gas entries + tx step pills ── */}
      {(nativeGasEntries.length > 0 || bridgeResult?.steps?.some((s) => s.txHash)) ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {nativeGasEntries.map(({ token, amount }) => (
            <span
              key={token}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#132238] px-2 py-0.5 text-[10px] text-slate-300"
            >
              <span className="text-slate-500">Gas</span>
              <span>
                {amount < 0.000001 ? '<0.000001' : amount.toFixed(6)} {token}
              </span>
            </span>
          ))}
          {bridgeResult?.steps
            ?.filter((step) => step.txHash)
            .map((step, index) => {
              const stepName = step.name ?? step.action ?? `Step ${index + 1}`;
              const stepChainKey = stepName.toLowerCase() === 'mint' ? destinationKey : sourceKey;
              const explorerBase = getExplorerBase(stepChainKey);
              return (
                <a
                  key={`${stepName}-${index}`}
                  href={`${explorerBase}${step.txHash}${stepChainKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#132238] px-2 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <span
                    className={`inline-flex h-[5px] w-[5px] rounded-full ${
                      step.state === 'success' ? 'bg-emerald-400' : step.state === 'error' ? 'bg-rose-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="capitalize">{stepName}</span>
                  <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                </a>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
