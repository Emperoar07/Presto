'use client';

import { memo } from 'react';
import Link from 'next/link';

export const AppFooter = memo(function AppFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-6 bg-white dark:bg-background-dark">
      <div className="mx-auto max-w-7xl px-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>&copy; 2026 Presto. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/docs#privacy-policy" className="transition-colors hover:text-primary">
              Privacy Policy
            </Link>
            <Link href="/docs#terms-of-use" className="transition-colors hover:text-primary">
              Terms of Use
            </Link>
            <Link href="/docs#cookie-policy" className="transition-colors hover:text-primary">
              Cookie Policy
            </Link>
          </div>
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
      </div>
    </footer>
  );
});
