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
  const { address, isConnected } = useAccount();
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isClaimingTokens, setIsClaimingTokens] = useState(false);

  const faucetUrl = address
    ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
    : 'https://docs.tempo.xyz/quickstart/faucet';

  // Check cooldown on open and periodically
  useEffect(() => {
    if (isOpen && address) {
      const checkCooldown = () => {
        const remaining = getCooldownRemaining(address);
        setCooldownRemaining(remaining);
      };

      checkCooldown();
      const interval = setInterval(checkCooldown, 1000); // Update every second for smooth countdown

      return () => clearInterval(interval);
    }
  }, [isOpen, address]);

  useEffect(() => {
    if (isOpen) {
      setIsClaimingTokens(false);
    }
  }, [isOpen]);

  const handleClaimTokens = useCallback(() => {
    if (!address) return;

    // Record the claim (starts cooldown)
    recordClaim(address);
    setCooldownRemaining(COOLDOWN_MS);
    setIsClaimingTokens(true);

    // Open the faucet page in a new tab
    window.open(faucetUrl, '_blank', 'noopener,noreferrer');
  }, [address, faucetUrl]);

  if (!isOpen) return null;

  const isOnCooldown = cooldownRemaining > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-3xl overflow-hidden bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_0_60px_rgba(0,243,255,0.15)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00F3FF]/20 to-[#BC13FE]/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Testnet Faucet</h2>
                <p className="text-xs text-zinc-500">Claim free TEMPO tokens</p>
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
          <div className="p-6">
            {!isConnected ? (
              /* Not Connected State */
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Wallet Not Connected</h3>
                <p className="text-zinc-400 text-sm">Please connect your wallet to claim testnet tokens.</p>
              </div>
            ) : isOnCooldown && !isClaimingTokens ? (
              /* Cooldown State */
              <div className="text-center py-6">
                <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Cooldown Active</h3>
                <p className="text-zinc-400 text-sm mb-5">
                  You can claim tokens once every {COOLDOWN_HOURS} hours.
                </p>

                {/* Countdown Timer */}
                <div className="inline-flex flex-col items-center px-8 py-4 rounded-2xl bg-gradient-to-r from-[#00F3FF]/10 to-[#BC13FE]/10 border border-white/10">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Next claim available in</p>
                  <p className="text-3xl font-bold text-[#00F3FF] font-mono">{formatTimeRemaining(cooldownRemaining)}</p>
                </div>

                {/* Wallet Info */}
                <div className="mt-6 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-zinc-500 mb-1">Connected Wallet</p>
                  <p className="text-sm text-[#00F3FF] font-mono">{address}</p>
                </div>
              </div>
            ) : isClaimingTokens ? (
              /* Success State */
              <div className="text-center py-6">
                <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Faucet Opened!</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Complete the claim on the Tempo faucet page.<br />
                  Your tokens will arrive shortly.
                </p>
                <p className="text-xs text-zinc-500">
                  Next claim available in <span className="text-[#00F3FF]">{COOLDOWN_HOURS} hours</span>
                </p>

                <button
                  onClick={onClose}
                  className="mt-6 w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F3FF]/20 to-[#BC13FE]/20 border border-[#00F3FF]/40 text-white font-medium hover:from-[#00F3FF]/30 hover:to-[#BC13FE]/30 transition-all duration-300"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Ready to Claim State */
              <div className="py-4">
                {/* Wallet Display */}
                <div className="mb-6 px-4 py-4 rounded-2xl bg-gradient-to-r from-[#00F3FF]/5 to-[#BC13FE]/5 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Your Wallet</span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  </div>
                  <p className="text-lg text-white font-mono truncate">{address}</p>
                </div>

                {/* Info */}
                <div className="mb-6 space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-[#00F3FF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-400">Receive test stablecoins on Tempo testnet</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-[#00F3FF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-zinc-400">Funds arrive instantly to your wallet</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-zinc-400">{COOLDOWN_HOURS}-hour cooldown between claims</span>
                  </div>
                </div>

                {/* Claim Button */}
                <button
                  onClick={handleClaimTokens}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] text-white font-semibold text-lg hover:opacity-90 transition-all duration-300 shadow-[0_0_30px_rgba(0,243,255,0.3)] hover:shadow-[0_0_40px_rgba(0,243,255,0.5)] flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Claim Testnet Tokens
                </button>

                <p className="text-center text-xs text-zinc-600 mt-3">
                  Opens Tempo faucet in a new tab
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
});
