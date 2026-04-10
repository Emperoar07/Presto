'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AppSidebar } from '@/components/common/AppSidebar';
import { AppFooter } from '@/components/common/AppFooter';
import { PageTopbar } from '@/components/common/PageTopbar';
import { SidebarProvider } from '@/components/common/SidebarContext';
import { isArcChain } from '@/config/contracts';

const ARC_CHAIN_ID = 5042002;

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const isMintPage = pathname.startsWith('/mint/');
  const chainId = useChainId();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const prevPathname = useRef(pathname);
  const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';
  const faucetUrl = isArcChain(chainId)
    ? 'https://faucet.circle.com'
    : address
      ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
      : 'https://docs.tempo.xyz/quickstart/faucet';

  useEffect(() => {
    const wasBridge = prevPathname.current === '/bridge';
    const isBridge = pathname === '/bridge';
    prevPathname.current = pathname;
    if (wasBridge && !isBridge && chainId !== ARC_CHAIN_ID) {
      switchChain({ chainId: ARC_CHAIN_ID });
    }
  }, [pathname, chainId, switchChain]);

  useEffect(() => {
    if (isMintPage && chainId && chainId !== ARC_CHAIN_ID) {
      switchChain({ chainId: ARC_CHAIN_ID });
    }
  }, [chainId, isMintPage, switchChain]);

  if (isLanding) {
    return <div className="flex min-h-screen w-full flex-col overflow-x-hidden">{children}</div>;
  }

  if (isMintPage) {
    return (
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[#0f172a] text-slate-100">
        <header className="sticky top-0 z-40 border-b border-white/5 bg-[#101a2c]/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1140px] items-center justify-between px-4 md:px-6">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-primary/10">
                <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="15" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.45" fill="#25c0f4" fillOpacity="0.08" />
                  <circle cx="16" cy="16" r="10" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.7" fill="none" />
                  <circle cx="16" cy="16" r="4.5" fill="#25c0f4" />
                </svg>
              </span>
              <div className="hidden sm:block">
                <p className="text-[15px] font-extrabold leading-none text-white">Presto</p>
                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">Arc Testnet</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {!isProductionMode ? (
                <a
                  href={faucetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary/20 bg-transparent px-3 py-1.5 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="material-symbols-outlined text-[15px]">water_drop</span>
                  Faucet
                </a>
              ) : null}

              <div className="hidden sm:block">
                <ConnectButton />
              </div>
              <div className="sm:hidden">
                <ConnectButton />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-[#0f172a]">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[#0f172a]">
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>

      <div className="flex min-h-screen w-full flex-col md:pl-[220px]">
        <div className="h-14 md:hidden" />
        <Suspense fallback={null}>
          <PageTopbar />
        </Suspense>
        <main className="flex-1 bg-[#0f172a]">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
