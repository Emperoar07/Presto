'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useChainId, useSwitchChain } from 'wagmi';
import { AppSidebar } from '@/components/common/AppSidebar';
import { AppFooter } from '@/components/common/AppFooter';
import { PageTopbar } from '@/components/common/PageTopbar';
import { SidebarProvider } from '@/components/common/SidebarContext';

const ARC_CHAIN_ID = 5042002;

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    const wasBridge = prevPathname.current === '/bridge';
    const isBridge = pathname === '/bridge';
    prevPathname.current = pathname;
    if (wasBridge && !isBridge && chainId !== ARC_CHAIN_ID) {
      switchChain({ chainId: ARC_CHAIN_ID });
    }
  }, [pathname, chainId, switchChain]);

  if (isLanding) {
    return <div className="flex min-h-screen w-full flex-col overflow-x-hidden">{children}</div>;
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
