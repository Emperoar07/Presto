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
      className="mt-3 overflow-hidden rounded-[14px]"
      style={{ background: '#161f31', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div
        className="flex items-start justify-between gap-3 px-3.5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Bridge Progress</p>
          <p className="mt-1 text-[12.5px] font-medium text-slate-200">
            {statusMessage ?? (errorMessage ? 'Bridge needs attention.' : 'Preparing the transfer...')}
          </p>
        </div>
        {(estimate || bridgeStatusCard) ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
              bridgeStatusCard?.state === 'error'
                ? 'text-rose-300'
                : bridgeStatusCard?.state === 'success'
                  ? 'text-emerald-300'
                  : 'text-slate-200'
            }`}
            style={{ background: '#223046', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {estimate ? (totalUsdc > 0 ? formatUsd(totalUsdc.toString()) : '$0.0000') : bridgeStatusCard?.state ?? 'Live'}
          </span>
        ) : null}
      </div>

      <div className="space-y-2.5 px-3.5 py-3.5">
        {errorMessage ? (
          <div className="rounded-[10px] border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11.5px] text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        {bridgeStatusCard ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-white/5 bg-[#121a2a] px-3 py-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                bridgeStatusCard.state === 'success'
                  ? 'bg-emerald-400'
                  : bridgeStatusCard.state === 'error'
                    ? 'bg-rose-400'
                    : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[11.5px] text-slate-300">{bridgeStatusCard.message}</span>
          </div>
        ) : null}

        {estimate ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[10px] border border-white/5 bg-[#111a2a] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Receive</p>
                <p className="mt-1 text-[12px] font-semibold text-emerald-400">{estimatedReceiveAmount} USDC</p>
              </div>
              <div className="rounded-[10px] border border-white/5 bg-[#111a2a] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Estimated Fee</p>
                <p className="mt-1 text-[12px] font-semibold text-slate-100">
                  {hasEstimateFees && totalUsdc > 0 ? `${totalUsdc.toFixed(totalUsdc >= 1 ? 2 : 6)} USDC` : 'No fees'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onExactAmountModeChange(!exactAmountMode)}
                className="flex items-center justify-between rounded-[10px] border border-white/5 bg-[#111a2a] px-3 py-2 text-left transition-colors hover:border-primary/20"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Fee Mode</p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-100">
                    {exactAmountMode ? 'Exact receive' : 'Fees from amount'}
                  </p>
                </div>
                <span className="text-[10.5px] font-semibold text-slate-400">{exactAmountMode ? 'On' : 'Off'}</span>
              </button>
            </div>

            {nativeGasEntries.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {nativeGasEntries.map(({ token, amount }) => (
                  <span
                    key={token}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#132238] px-2.5 py-1 text-[10px] text-slate-300"
                  >
                    <span className="text-slate-500">Gas</span>
                    <span>
                      {amount < 0.000001 ? '<0.000001' : amount.toFixed(6)} {token}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {bridgeResult?.steps?.some((step) => step.txHash) ? (
          <div className="flex flex-wrap gap-1.5">
            {bridgeResult.steps
              .filter((step) => step.txHash)
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
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#132238] px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
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
        ) : null}
      </div>
    </div>
  );
}
