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

      {/* Modal - Sized to frame faucet content nicely */}
      <div className="fixed inset-4 sm:inset-8 md:inset-y-16 md:inset-x-[15%] lg:inset-y-20 lg:inset-x-[20%] xl:inset-x-[25%] z-[101] flex flex-col rounded-3xl overflow-hidden bg-[#0a0a0a] border border-white/10 shadow-[0_0_60px_rgba(0,243,255,0.15)]">
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {address && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-zinc-400 font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-200"
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
              <p className="text-zinc-400 text-sm max-w-xs">
                Connect your wallet to claim testnet tokens.
              </p>
            </div>
          ) : (
            /* Faucet iframe */
            <>
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10">
                  <div className="w-10 h-10 border-2 border-[#00F3FF]/30 border-t-[#00F3FF] rounded-full animate-spin mb-3" />
                  <p className="text-zinc-400 text-sm">Loading Faucet...</p>
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
