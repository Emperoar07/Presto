'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useAccount } from 'wagmi';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const COOLDOWN_HOURS = 48;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
const STORAGE_KEY = 'prestodex_faucet_claims';

// Get claim history from localStorage
const getClaimHistory = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

// Save claim timestamp for a wallet
const recordClaim = (address: string) => {
  if (typeof window === 'undefined') return;
  const history = getClaimHistory();
  history[address.toLowerCase()] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

// Check if wallet is on cooldown
const getCooldownRemaining = (address: string): number => {
  const history = getClaimHistory();
  const lastClaim = history[address.toLowerCase()];
  if (!lastClaim) return 0;

  const elapsed = Date.now() - lastClaim;
  const remaining = COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
};

// Format milliseconds to readable time
const formatTimeRemaining = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const FaucetModal = memo(function FaucetModal({ isOpen, onClose }: Props) {
  const { address } = useAccount();
  const [iframeError, setIframeError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [hasClaimed, setHasClaimed] = useState(false);

  const faucetUrl = address
    ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
    : 'https://docs.tempo.xyz/quickstart/faucet';

  const chainlinkFaucetUrl = 'https://faucets.chain.link/tempo-testnet';

  // Check cooldown on open and periodically
  useEffect(() => {
    if (isOpen && address) {
      const checkCooldown = () => {
        const remaining = getCooldownRemaining(address);
        setCooldownRemaining(remaining);
      };

      checkCooldown();
      const interval = setInterval(checkCooldown, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [isOpen, address]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setIframeError(false);
      setHasClaimed(false);
    }
  }, [isOpen]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setIsLoading(false);
  }, []);

  const handleClaimSuccess = useCallback(() => {
    if (address) {
      recordClaim(address);
      setHasClaimed(true);
      setCooldownRemaining(COOLDOWN_MS);
    }
  }, [address]);

  const openInNewTab = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    // Record claim when opening external faucet
    if (address) {
      recordClaim(address);
      setHasClaimed(true);
      setCooldownRemaining(COOLDOWN_MS);
    }
  }, [address]);

  if (!isOpen) return null;

  const isOnCooldown = cooldownRemaining > 0 && !hasClaimed;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-10 lg:inset-20 z-[101] flex items-center justify-center">
        <div className="relative w-full h-full max-w-4xl max-h-[80vh] rounded-3xl overflow-hidden bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_0_60px_rgba(0,243,255,0.15)] animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00F3FF]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Claim Testnet Tokens</h2>
                <p className="text-xs text-zinc-500">Get free TEMPO tokens for testing</p>
              </div>
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
          <div className="relative h-[calc(100%-80px)]">
            {/* Cooldown Warning */}
            {isOnCooldown && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-20 p-8 text-center">
                <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                  <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Cooldown Active</h3>
                <p className="text-zinc-400 text-sm mb-4 max-w-md">
                  You can claim testnet tokens once every {COOLDOWN_HOURS} hours per wallet.
                </p>
                <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00F3FF]/10 to-[#BC13FE]/10 border border-white/10 mb-6">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Time Remaining</p>
                  <p className="text-3xl font-bold text-[#00F3FF]">{formatTimeRemaining(cooldownRemaining)}</p>
                </div>
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-medium hover:bg-white/10 hover:text-white transition-all duration-300"
                >
                  Close
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !iframeError && !isOnCooldown && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                <div className="w-12 h-12 border-2 border-[#00F3FF]/30 border-t-[#00F3FF] rounded-full animate-spin mb-4" />
                <p className="text-zinc-400 text-sm">Loading faucet...</p>
              </div>
            )}

            {/* Claim Success */}
            {hasClaimed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-20 p-8 text-center">
                <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                  <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Claim Initiated!</h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-md">
                  Your testnet tokens should arrive shortly. You can claim again in {COOLDOWN_HOURS} hours.
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00F3FF]/20 to-[#BC13FE]/20 border border-[#00F3FF]/40 text-white font-medium hover:from-[#00F3FF]/30 hover:to-[#BC13FE]/30 transition-all duration-300"
                >
                  Done
                </button>
              </div>
            )}

            {/* Iframe Error / Fallback */}
            {iframeError && !isOnCooldown ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Embedded faucet unavailable</h3>
                <p className="text-zinc-400 text-sm mb-8 max-w-md">
                  The faucet cannot be embedded directly. Please use one of the options below to claim your testnet tokens.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => openInNewTab(faucetUrl)}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00F3FF]/20 to-[#BC13FE]/20 border border-[#00F3FF]/40 text-white font-medium hover:from-[#00F3FF]/30 hover:to-[#BC13FE]/30 transition-all duration-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Tempo Faucet
                  </button>
                  <button
                    onClick={() => openInNewTab(chainlinkFaucetUrl)}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-medium hover:bg-white/10 hover:text-white transition-all duration-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Chainlink Faucet
                  </button>
                </div>
              </div>
            ) : !isOnCooldown && !hasClaimed && (
              /* Iframe with claim button overlay */
              <div className="relative h-full">
                <iframe
                  src={faucetUrl}
                  className="w-full h-full border-0"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  title="Tempo Faucet"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />

                {/* Mark as claimed button - floating at bottom */}
                {!isLoading && (
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
                    <button
                      onClick={handleClaimSuccess}
                      className="px-6 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    >
                      I&apos;ve Claimed My Tokens
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Wallet Address Display */}
          {address && !isOnCooldown && !hasClaimed && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center pointer-events-none">
              <div className="px-4 py-2 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 text-xs text-zinc-400">
                Connected: <span className="text-[#00F3FF] font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});
