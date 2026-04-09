'use client';

import { memo } from 'react';
import Link from 'next/link';

export const AppFooter = memo(function AppFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.07] bg-[#0f172a] py-6">
      <div className="mx-auto max-w-7xl px-4 text-xs text-slate-400">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>&copy; 2026 Presto. All rights reserved.</p>
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
