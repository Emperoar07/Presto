'use client';

import { memo } from 'react';
import Link from 'next/link';

export const AppFooter = memo(function AppFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-6 bg-white dark:bg-background-dark">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-500 md:flex-row dark:text-slate-400">
        <p>&copy; 2026 PrestoDEX. All rights reserved.</p>
        <p>
          <Link
            href="https://x.com/emperoar007"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-primary"
          >
            Built with love by 0xb for the decentralized world.
          </Link>
        </p>
      </div>
    </footer>
  );
});
