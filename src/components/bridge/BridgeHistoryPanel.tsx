'use client';

import type { BridgeHistoryItem } from './types';
import { NETWORKS, formatTokenAmount, getExplorerBase } from './constants';

export function BridgeHistoryPanel({
  bridgeHistory,
  claimingItemId,
  onClose,
  onManualClaim,
}: {
  bridgeHistory: BridgeHistoryItem[];
  claimingItemId: string | null;
  onClose: () => void;
  onManualClaim: (item: BridgeHistoryItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 px-4 py-8">
      <div className="w-full max-w-lg rounded-[18px] border border-white/10 bg-[#151f33] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bridge History</p>
            <p className="mt-1 text-xs text-slate-300">{bridgeHistory.length} entries</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {bridgeHistory.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#132238] px-3 py-3 text-xs text-slate-400">
              No bridge history yet.
            </div>
          ) : (
            bridgeHistory.map((item) => {
              const effectiveState = item.liveState ?? item.state;
              const displayState =
                effectiveState === 'success'
                  ? 'Success'
                  : effectiveState === 'error'
                    ? 'Failed'
                    : 'Pending';

              const accentClass =
                displayState === 'Success'
                  ? 'bg-emerald-400'
                  : displayState === 'Failed'
                    ? 'bg-rose-400'
                    : 'bg-amber-400';

              return (
                <div key={item.id} className="rounded-lg border border-white/10 bg-[#132238] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {NETWORKS[item.sourceKey].shortLabel} to {NETWORKS[item.destinationKey].shortLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{formatTokenAmount(item.amount, 2)} USDC</p>
                      {item.liveNote ? <p className="mt-2 text-xs text-slate-400">{item.liveNote}</p> : null}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                      <span className={`inline-flex h-2 w-2 rounded-full ${accentClass}`} />
                      {displayState}
                    </div>
                  </div>

                  {displayState === 'Failed' && item.errorMessage ? (
                    <p className="mt-2 text-xs text-rose-300">{item.errorMessage}</p>
                  ) : null}

                  {(() => {
                    const stepsWithHash = item.steps.filter((step) => step.txHash);
                    const hasStepLinks = stepsWithHash.length > 0;
                    const fallbackHash = !hasStepLinks ? item.sourceTxHash : null;

                    return (hasStepLinks || fallbackHash) ? (
                      <div className="mt-2 space-y-1.5">
                        {stepsWithHash.map((step, index) => {
                          const stepName = step.name ?? step.action ?? `Step ${index + 1}`;
                          const stepChainKey =
                            stepName.toLowerCase() === 'mint'
                              ? item.destinationKey
                              : item.sourceKey;
                          const explorerBase = getExplorerBase(stepChainKey);
                          return (
                            <a
                              key={`${item.id}-${stepName}-${index}`}
                              href={`${explorerBase}${step.txHash}${stepChainKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between rounded-md border border-white/10 px-2.5 py-2 text-[11px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                            >
                              <span>{stepName}</span>
                              <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                            </a>
                          );
                        })}
                        {fallbackHash ? (
                          <a
                            href={`${getExplorerBase(item.sourceKey)}${fallbackHash}${item.sourceKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-md border border-white/10 px-2.5 py-2 text-[11px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                          >
                            <span>View on {NETWORKS[item.sourceKey].shortLabel}</span>
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                          </a>
                        ) : null}
                      </div>
                    ) : null;
                  })()}

                  {displayState !== 'Success' && item.rawResult ? (
                    <button
                      type="button"
                      disabled={claimingItemId === item.id}
                      onClick={() => onManualClaim(item)}
                      className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {claimingItemId === item.id ? (
                        <>
                          <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                          <span>Claiming...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[15px]">replay</span>
                          <span>Retry Claim</span>
                        </>
                      )}
                    </button>
                  ) : displayState === 'Pending' && !item.rawResult ? (
                    <p className="mt-2 text-[10px] text-slate-500">
                      Auto-claiming when attestation is ready...
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
