'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useChainId, useSwitchChain } from 'wagmi';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AppSidebar } from '@/components/common/AppSidebar';
import { AppFooter } from '@/components/common/AppFooter';
import { PageTopbar } from '@/components/common/PageTopbar';
import { SidebarProvider, useSidebar } from '@/components/common/SidebarContext';
import { PrestoDexLogo } from '@/components/common/PrestoDexLogo';

const ARC_CHAIN_ID = 5042002;

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const isMintPage = pathname.startsWith('/mint/');
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { collapsed } = useSidebar();
  const prevPathname = useRef(pathname);

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
              <PrestoDexLogo />
              <div className="hidden sm:block">
                <p className="text-[13px] font-extrabold leading-none text-white">Presto</p>
                <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-primary">Arc Testnet</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-[#1e293b] px-3 py-1.5 text-[11.5px] font-semibold text-slate-300 transition-colors hover:bg-[#263347] hover:text-white"
              >
                <span className="material-symbols-outlined text-[15px]">home</span>
                Home
              </Link>

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

      <div
        className="flex min-h-screen w-full flex-col"
        style={{
          paddingLeft: collapsed ? 64 : 220,
          transition: 'padding-left 0.25s ease',
        }}
      >
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
