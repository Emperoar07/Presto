'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const faucetUrl = isConnected && address
    ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
    : 'https://docs.tempo.xyz/quickstart/faucet';

  const isActive = (path: string) => pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-none">PrestoDEX</span>
            <span className="text-[10px] text-zinc-500 font-medium tracking-wide">Instant swaps on Tempo</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/swap" 
              className={`text-sm font-medium transition-colors ${
                isActive('/swap') 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }`}
            >
              Swap
            </Link>
            <Link 
              href="/liquidity" 
              className={`text-sm font-medium transition-colors ${
                isActive('/liquidity') 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }`}
            >
              Liquidity
            </Link>
            <Link 
              href="/analytics" 
              className={`text-sm font-medium transition-colors ${
                isActive('/analytics') 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }`}
            >
              Analytics
            </Link>
          </nav>
          <span className="hidden md:inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            Testnet beta
          </span>
        </div>

        <div className="flex items-center gap-4">
          <a
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[#00F3FF]/40 bg-[#00F3FF]/10 px-3 py-1 text-xs font-semibold text-[#00F3FF] hover:bg-[#00F3FF]/20 transition-colors"
          >
            Claim Faucet
          </a>
          <ConnectButton showBalance={false} />
        </div>
      </div>
    </header>
  );
}
