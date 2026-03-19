'use client';

import Link from 'next/link';
import { SwapCardEnhanced } from '@/components/swap/SwapCardEnhanced';

export default function SwapPage() {
  return (
    <main className="flex flex-col items-center px-4 py-5 md:py-7">
      <div className="w-full max-w-[480px] space-y-5 animate-slide-up">
        <SwapCardEnhanced />

        <div className="mt-2 flex items-center justify-center gap-6">
          <Link
            className="flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-primary dark:text-slate-500"
            href="/docs"
          >
            View docs <span className="material-symbols-outlined text-xs">open_in_new</span>
          </Link>
          <Link
            className="text-xs font-medium text-slate-400 transition-colors hover:text-primary dark:text-slate-500"
            href="/liquidity"
          >
            Explore liquidity
          </Link>
        </div>
      </div>
    </main>
  );
}
