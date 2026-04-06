'use client';

import { memo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useChainId } from 'wagmi';
import { FaucetModal } from './FaucetModal';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';

const PAGE_TITLES: Record<string, string> = {
  '/swap': 'Swap',
  '/liquidity': 'Pools',
  '/bridge': 'Bridge',
  '/portfolio': 'Portfolio',
  '/transactions': 'Activity',
  '/analytics': 'Analytics',
  '/docs': 'Docs',
};

const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';

export const PageTopbar = memo(function PageTopbar() {
  const pathname = usePathname();
  const chainId = useChainId();
  const [faucetOpen, setFaucetOpen] = useState(false);

  const title = PAGE_TITLES[pathname] ?? '';

  if (!title) {
    return null;
  }

  const faucetLabel = isArcChain(chainId)
    ? 'Faucet'
    : isTempoNativeChain(chainId)
      ? 'Faucet'
      : 'Faucet';

  return (
    <>
      <div className="sticky top-0 z-30 flex h-[58px] items-center border-b border-white/[0.07] bg-[#0f172a]/95 px-4 backdrop-blur-md md:px-7">
        <span className="text-[15px] font-bold text-slate-100">{title}</span>
        {!isProductionMode ? (
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setFaucetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-primary/20 bg-transparent px-[10px] py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <span className="material-symbols-outlined text-[14px]">water_drop</span>
              {faucetLabel}
            </button>
          </div>
        ) : null}
      </div>
      <FaucetModal isOpen={faucetOpen} onClose={() => setFaucetOpen(false)} />
    </>
  );
});
