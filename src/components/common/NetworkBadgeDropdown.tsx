'use client';

import Image from 'next/image';
import { useChainId } from 'wagmi';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';

export function getNetworkVisual(chainId?: number) {
  if (isArcChain(chainId)) {
    return {
      iconSrc: '/networks/arc.svg',
      label: 'Arc',
      badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    };
  }

  if (isTempoNativeChain(chainId)) {
    return {
      iconSrc: '/networks/tempo.svg',
      label: 'Tempo',
      badgeClass: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    };
  }

  return null;
}

export function getDisplayChainName(chainId?: number, fallback?: string) {
  if (isTempoNativeChain(chainId)) return 'Tempo Testnet';
  if (isArcChain(chainId)) return 'Arc Testnet';
  return fallback ?? 'Supported Network';
}

export function NetworkBadgeDropdown() {
  const chainId = useChainId();
  const displayName = getDisplayChainName(chainId);

  const isTestnet = true;
  const visual = getNetworkVisual(chainId);
  const fallbackClass = isTestnet
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide backdrop-blur-xl shadow-[0_0_15px_rgba(16,185,129,0.2)] mb-2 ${
        visual?.badgeClass ?? fallbackClass
      }`}
    >
      {visual ? (
        <span className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-white/10">
          <Image src={visual.iconSrc} alt={`${visual.label} logo`} width={20} height={20} className="h-5 w-5" />
        </span>
      ) : (
        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full animate-pulse ${isTestnet ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      )}
      {displayName}
    </span>
  );
}
