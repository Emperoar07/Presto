'use client';

import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/common/AppHeader';
import { AppFooter } from '@/components/common/AppFooter';

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
      {!isLanding && <AppHeader />}
      <div className={isLanding ? 'flex-1' : 'flex-1 pt-4'}>{children}</div>
      {!isLanding && <AppFooter />}
      {/* Decorative Glows */}
      <div className="fixed top-1/4 -left-20 w-80 h-80 bg-primary/5 dark:bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 -right-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}
