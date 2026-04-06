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
      className="overflow-hidden rounded-[22px]"
      style={{ background: '#1a2436', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 10px 28px rgba(2,6,23,0.22)' }}
    >
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-500">Bridge History</p>
          <p className="mt-1 text-[16px] font-bold tracking-tight text-slate-50">Recent Transfers</p>
        </div>
        <span
          className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-300"
          style={{ background: '#223046', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {bridgeHistory.length} {bridgeHistory.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4">
        {bridgeHistory.length === 0 ? (
          <div
            className="rounded-[18px] px-5 py-10 text-center text-[13px] text-slate-500"
            style={{ background: '#162133', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            No bridge transfers yet.
          </div>
        ) : (
          bridgeHistory.map((item) => {
            const effectiveState = item.liveState ?? item.state;
            const isSuccess = effectiveState === 'success';
            const isFailed = effectiveState === 'error';
            const sourceNet = NETWORKS[item.sourceKey];
            const destNet = NETWORKS[item.destinationKey];
            const label = `${sourceNet?.shortLabel ?? item.sourceKey} to ${destNet?.shortLabel ?? item.destinationKey}`;
            const amtLabel = item.amount ? `${formatTokenAmount(item.amount, 6)} USDC` : 'USDC';
            const stateLabel = isSuccess ? 'Completed' : isFailed ? 'Failed' : 'Pending';
            const timeLabel = formatRelativeTime(item.createdAt, now);
            const iconColor = isSuccess ? '#a78bfa' : isFailed ? '#f43f5e' : '#fbbf24';
            const iconBg = isSuccess ? 'rgba(167,139,250,0.12)' : isFailed ? 'rgba(244,63,94,0.10)' : 'rgba(245,158,11,0.12)';
            const statusTone = isSuccess ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-amber-400';

            return (
              <div
                key={item.id}
                className="rounded-[18px] px-5 py-5 transition-colors"
                style={{ background: '#162133', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full" style={{ background: iconBg }}>
                    <span className="material-symbols-outlined text-[20px]" style={{ color: iconColor }}>
                      {isFailed ? 'error' : 'sync_alt'}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-slate-100">{label}</p>
                        <p className="mt-0.5 text-[12px] text-slate-500">
                          {amtLabel} · {stateLabel}
                        </p>
                      </div>

                      <div className="text-right">
                        {isSuccess ? (
                          <p className="text-[13px] font-bold text-emerald-400">+{formatTokenAmount(item.amount, 6)} USDC</p>
                        ) : isFailed ? (
                          <p className="text-[13px] font-bold text-rose-400">Failed</p>
                        ) : (
                          <p className="text-[13px] font-bold text-amber-400">Pending</p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-500">{timeLabel}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${statusTone}`}
                        style={{
                          background: isSuccess
                            ? 'rgba(16,185,129,0.10)'
                            : isFailed
                              ? 'rgba(244,63,94,0.10)'
                              : 'rgba(245,158,11,0.10)',
                          border: isSuccess
                            ? '1px solid rgba(16,185,129,0.18)'
                            : isFailed
                              ? '1px solid rgba(244,63,94,0.18)'
                              : '1px solid rgba(245,158,11,0.18)',
                        }}
                      >
                        {stateLabel}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-400"
                        style={{ background: '#1c2940', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        {timeLabel}
                      </span>
                    </div>

                    {item.liveNote ? <p className="mt-4 text-[12px] leading-6 text-slate-400">{item.liveNote}</p> : null}
                    {isFailed && item.errorMessage ? <p className="mt-2 text-[12px] text-rose-300">{item.errorMessage}</p> : null}

                    {(() => {
                      const stepsWithHash = item.steps.filter((step) => step.txHash);
                      const hasStepLinks = stepsWithHash.length > 0;
                      const fallbackHash = !hasStepLinks ? item.sourceTxHash : null;

                      return hasStepLinks || fallbackHash ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {stepsWithHash.map((step, index) => {
                            const stepName = step.name ?? step.action ?? `Step ${index + 1}`;
                            const stepChainKey = stepName.toLowerCase() === 'mint' ? item.destinationKey : item.sourceKey;
                            const explorerBase = getExplorerBase(stepChainKey);
                            return (
                              <a
                                key={`${item.id}-${stepName}-${index}`}
                                href={`${explorerBase}${step.txHash}${stepChainKey === 'solana-devnet' ? '?cluster=devnet' : ''}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-200 transition-colors hover:border-primary/30 hover:text-primary"
                                style={{ background: '#192538' }}
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
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-200 transition-colors hover:border-primary/30 hover:text-primary"
                              style={{ background: '#192538' }}
                            >
                              <span>View on {NETWORKS[item.sourceKey].shortLabel}</span>
                              <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                            </a>
                          ) : null}
                        </div>
                      ) : null;
                    })()}

                    {stateLabel !== 'Completed' && item.rawResult ? (
                      <button
                        type="button"
                        disabled={claimingItemId === item.id}
                        onClick={() => onManualClaim(item)}
                        className="mt-5 flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] border border-primary/20 px-3 text-[13px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: '#162e45' }}
                      >
                        {claimingItemId === item.id ? (
                          <>
                            <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                            <span>Claiming...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[15px]">replay</span>
                            <span>Complete Mint</span>
                          </>
                        )}
                      </button>
                    ) : stateLabel === 'Pending' && !item.rawResult ? (
                      <p className="mt-3 text-[10px] text-slate-500">Auto claiming when attestation is ready...</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
