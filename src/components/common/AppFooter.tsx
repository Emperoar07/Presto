'use client';

import { memo } from 'react';
import Link from 'next/link';

export const AppFooter = memo(function AppFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.07] bg-[#0f172a] py-6">
      <div className="mx-auto max-w-7xl px-4 text-xs text-slate-400">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>&copy; 2026 Presto. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link
              href="https://arclenz.xyz/ecosystem/presto"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                background: '#04060f',
                border: '1px solid rgba(26,86,255,0.3)',
                borderRadius: '8px',
                textDecoration: 'none',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00b87a', display: 'inline-block' }} />
              <span style={{ color: '#e8ecff', fontWeight: 600 }}>Presto</span>
              <span style={{ color: '#6b7da8' }}>on ArcLens</span>
            </Link>
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
      </div>
    </footer>
  );
});
