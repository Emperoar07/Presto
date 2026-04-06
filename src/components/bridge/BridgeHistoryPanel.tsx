'use client';

import { useEffect, useState } from 'react';
import type { BridgeHistoryItem } from './types';
import { NETWORKS, formatTokenAmount, getExplorerBase } from './constants';

function formatRelativeTime(timestamp: number, now: number) {
  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function BridgeHistoryPanel({
  bridgeHistory,
  claimingItemId,
  onManualClaim,
}: {
  bridgeHistory: BridgeHistoryItem[];
  claimingItemId: string | null;
  onManualClaim: (item: BridgeHistoryItem) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div
      className="overflow-hidden rounded-[14px]"
      style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="px-4 pt-3.5 pb-2">
        <p className="text-[13px] font-bold text-slate-50">Transfer History</p>
      </div>

      <div className="h-[240px] overflow-y-auto">
        {bridgeHistory.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-slate-500">
            No bridge transfers yet.
          </div>
        ) : (
          bridgeHistory.map((item) => {
            const effectiveState = item.liveState ?? item.state;
            const isSuccess = effectiveState === 'success';
            const isFailed = effectiveState === 'error';
            const sourceNet = NETWORKS[item.sourceKey];
            const destNet = NETWORKS[item.destinationKey];
            const label = `${sourceNet?.shortLabel ?? item.sourceKey} → ${destNet?.shortLabel ?? item.destinationKey}`;
            const amountLabel = item.amount ? `${formatTokenAmount(item.amount, 6)} USDC` : 'USDC';
            const stateLabel = isSuccess ? 'Completed' : isFailed ? 'Failed' : 'Pending';
            const timeLabel = formatRelativeTime(item.createdAt, now);
            const iconColor = isSuccess ? '#a78bfa' : isFailed ? '#f43f5e' : '#fbbf24';
            const iconBg = isSuccess ? 'rgba(167,139,250,0.12)' : isFailed ? 'rgba(244,63,94,0.10)' : 'rgba(245,158,11,0.12)';

            return (
              <div key={item.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: iconBg }}
                  >
                    <span className="material-symbols-outlined text-[16px]" style={{ color: iconColor }}>
                      {isFailed ? 'error' : 'sync_alt'}
                    </span>
                  </div>

                  {/* Left: route + subtitle */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-100">{label}</p>
                    <p className="text-[11px] text-slate-500">
                      {amountLabel} · {stateLabel}
                    </p>
                  </div>

                  {/* Right: amount or status + time */}
                  <div className="flex-shrink-0 text-right">
                    {isSuccess ? (
                      <p className="text-[12.5px] font-bold text-emerald-400">
                        +{formatTokenAmount(item.amount, 6)} USDC
                      </p>
                    ) : isFailed ? (
                      <p className="text-[12.5px] font-bold text-rose-400">Failed</p>
                    ) : (
                      <p className="text-[12.5px] font-bold text-amber-400">Pending</p>
                    )}
                    <p className="text-[10px] text-slate-500">{timeLabel}</p>
                  </div>
                </div>

                {/* Expandable details: notes, errors, tx links, claim */}
                {(item.liveNote || (isFailed && item.errorMessage) || item.steps.some((s) => s.txHash) || item.sourceTxHash || (stateLabel !== 'Completed' && item.rawResult) || (stateLabel === 'Pending' && !item.rawResult)) ? (
                  <div className="px-4 pb-2.5 pl-[60px]">
                    {item.liveNote ? (
                      <p className="text-[11px] leading-5 text-slate-400">{item.liveNote}</p>
                    ) : null}

                    {isFailed && item.errorMessage ? (
                      <p className="text-[11px] text-rose-300">{item.errorMessage}</p>
                    ) : null}

                    {(() => {
                      const stepsWithHash = item.steps.filter((step) => step.txHash);
                      const hasStepLinks = stepsWithHash.length > 0;
                      const fallbackHash = !hasStepLinks ? item.sourceTxHash : null;

                      if (!hasStepLinks && !fallbackHash) return null;

                      return (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {stepsWithHash.map((step, index) => {
                            const stepName = step.name ?? step.action ?? `Step ${index + 1}`;
                            const stepChainKey =
                              stepName.toLowerCase() === 'mint' ? item.destinationKey : item.sourceKey;
                            const explorerBase = getExplorerBase(stepChainKey);

                            return (
                              <a
                                key={`${item.id}-${stepName}-${index}`}
                                href={`${explorerBase}${step.txHash}${stepChainKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#192538] px-2 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
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

                          {fallbackHash ? (
                            <a
                              href={`${getExplorerBase(item.sourceKey)}${fallbackHash}${item.sourceKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#192538] px-2 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                            >
                              <span>View on {NETWORKS[item.sourceKey].shortLabel}</span>
                              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                            </a>
                          ) : null}
                        </div>
                      );
                    })()}

                    {stateLabel !== 'Completed' && item.rawResult ? (
                      <button
                        type="button"
                        disabled={claimingItemId === item.id}
                        onClick={() => onManualClaim(item)}
                        className="mt-2 flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[8px] border border-primary/20 bg-[#162e45] text-[11px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claimingItemId === item.id ? (
                          <>
                            <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                            <span>Claiming...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[13px]">replay</span>
                            <span>Complete Mint</span>
                          </>
                        )}
                      </button>
                    ) : stateLabel === 'Pending' && !item.rawResult ? (
                      <p className="mt-1 text-[10px] text-slate-500">Auto claiming when attestation is ready...</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
