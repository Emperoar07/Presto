'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { isArcChain } from '@/config/contracts';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const FaucetModal = memo(function FaucetModal({ isOpen, onClose }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [isLoading, setIsLoading] = useState(true);

  const isArc = isArcChain(chainId);
  const supportsEmbed = !isArc;

  const faucetUrl = isArc
    ? 'https://faucet.circle.com'
    : address
      ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
      : 'https://docs.tempo.xyz/quickstart/faucet';

  useEffect(() => {
    if (isOpen) {
      setIsLoading(supportsEmbed);
    }
  }, [isOpen, supportsEmbed]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Sized to frame faucet content nicely */}
      <div className="fixed inset-4 sm:inset-8 md:inset-y-16 md:inset-x-[15%] lg:inset-y-20 lg:inset-x-[20%] xl:inset-x-[25%] z-[101] flex flex-col rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl">
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {address && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-hidden bg-[#1a1a1a]">
          {!isConnected ? (
            /* Not Connected State */
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Connect Your Wallet</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">
                Connect your wallet to claim testnet tokens.
              </p>
            </div>
          ) : isArc ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-3xl border border-slate-200/10 bg-slate-900/80 p-6 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[28px]">open_in_new</span>
                </div>
                <h3 className="text-lg font-bold text-white">Open Arc Faucet in a New Tab</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Arc uses Circle&apos;s faucet, and Circle blocks embedded iframes. Launch it in a new tab to request
                  USDC for Arc testnet.
                </p>
                {address && (
                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Connected wallet
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-slate-200">{address}</p>
                  </div>
                )}
                <div className="mt-5 flex flex-col gap-3">
                  <a
                    href={faucetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 dark:text-background-dark"
                  >
                    Open Circle Faucet
                    <span className="material-symbols-outlined text-base">north_east</span>
                  </a>
                  {address && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(address)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
                    >
                      Copy Wallet Address
                      <span className="material-symbols-outlined text-base">content_copy</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Faucet iframe */
            <>
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10">
                  <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Loading Faucet...</p>
                </div>
              )}

              {/* Embedded Faucet - Scaled to fit nicely */}
              <iframe
                src={faucetUrl}
                className="w-full h-full border-0"
                style={{
                  backgroundColor: '#1a1a1a',
                  minHeight: '500px'
                }}
                onLoad={handleIframeLoad}
                title={isArc ? 'Circle Faucet (Arc Testnet)' : 'Tempo Faucet'}
                allow="clipboard-write"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
});
