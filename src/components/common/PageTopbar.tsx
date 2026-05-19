'use client';

import { memo } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId } from 'wagmi';
import { isArcChain } from '@/config/contracts';

const PAGE_TITLES: Record<string, string> = {
  '/swap': 'Swap',
  '/liquidity': 'Pools',
  '/bridge': 'Bridge',
  '/send': 'Send',
  '/deploy': 'Deploy',
  '/portfolio': 'Portfolio',
  '/transactions': 'Activity',
  '/analytics': 'Analytics',
  '/docs': 'Docs',
};

const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';

export const PageTopbar = memo(function PageTopbar() {
  const pathname = usePathname();
  const chainId = useChainId();
  const { address } = useAccount();

  const title = PAGE_TITLES[pathname] || (pathname.startsWith('/deploy') ? 'Deploy' : '');

  if (!title) {
    return null;
  }

  const faucetUrl = isArcChain(chainId)
    ? 'https://faucet.circle.com'
    : address
      ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
      : 'https://docs.tempo.xyz/quickstart/faucet';

  return (
    <div className="sticky top-0 z-30 flex h-[58px] items-center border-b border-white/[0.07] bg-[#0f172a]/95 px-4 backdrop-blur-md md:px-7">
      <span className="text-[15px] font-bold text-slate-100">{title}</span>
      <div className="ml-auto flex items-center gap-2">
        <span
          aria-disabled="true"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-[10px] py-2 text-[11px] font-semibold text-slate-500"
        >
          <span className="material-symbols-outlined text-[14px]">trending_up</span>
          Markets
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Soon
          </span>
        </span>
        {!isProductionMode ? (
          <a
            href={faucetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-primary/20 bg-transparent px-[10px] py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined text-[14px]">water_drop</span>
            Faucet
          </a>
        ) : null}
      </div>
    </div>
  );
});
