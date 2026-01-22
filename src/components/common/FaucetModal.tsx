'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useAccount } from 'wagmi';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const FaucetModal = memo(function FaucetModal({ isOpen, onClose }: Props) {
  const { address, isConnected } = useAccount();
  const [isLoading, setIsLoading] = useState(true);

  const faucetUrl = address
    ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
    : 'https://docs.tempo.xyz/quickstart/faucet';

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
    }
  }, [isOpen]);

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

      {/* Modal - Full screen for better iframe experience */}
      <div className="fixed inset-2 sm:inset-4 md:inset-8 lg:inset-12 z-[101] flex flex-col rounded-3xl overflow-hidden bg-[#0a0a0a] border border-white/10 shadow-[0_0_60px_rgba(0,243,255,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-black/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F3FF]/20 to-[#BC13FE]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tempo Testnet Faucet</h2>
              <p className="text-xs text-zinc-500">Claim free testnet tokens</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Wallet indicator */}
            {address && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-zinc-400 font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-hidden">
          {!isConnected ? (
            /* Not Connected State */
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h3>
              <p className="text-zinc-400 text-sm max-w-sm">
                Please connect your wallet first to claim testnet tokens from the faucet.
              </p>
            </div>
          ) : (
            /* Faucet iframe */
            <>
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] z-10">
                  <div className="w-12 h-12 border-2 border-[#00F3FF]/30 border-t-[#00F3FF] rounded-full animate-spin mb-4" />
                  <p className="text-zinc-400 text-sm">Loading Tempo Faucet...</p>
                </div>
              )}

              {/* Embedded Faucet */}
              <iframe
                src={faucetUrl}
                className="w-full h-full border-0 bg-[#0a0a0a]"
                onLoad={handleIframeLoad}
                title="Tempo Faucet"
                allow="clipboard-write"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
});
