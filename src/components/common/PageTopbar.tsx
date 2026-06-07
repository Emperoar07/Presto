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
        <a
          href="https://presto-markets.vercel.app/markets?cat=Trending"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-primary/20 bg-primary/5 px-[10px] py-2 text-[11px] font-semibold text-primary transition-all duration-200 hover:bg-primary/10 hover:border-primary/40 shadow-[0_0_12px_rgba(37,192,244,0.05)] hover:shadow-[0_0_16px_rgba(37,192,244,0.15)]"
        >
          <span className="material-symbols-outlined text-[14px] animate-pulse">trending_up</span>
          Markets
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-emerald-400 animate-pulse">
            New
          </span>
        </a>
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
