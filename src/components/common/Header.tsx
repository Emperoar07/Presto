'use client';

import { useState, useCallback, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';

// Network badge configuration
// Note: 42431 is Tempo Moderato TESTNET, not mainnet
// Only add actual mainnet chain IDs here when ready for production
const MAINNET_CHAIN_IDS: number[] = []; // Empty for now - all chains are testnet
const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';

const NavLink = memo(function NavLink({
  href,
  isActive,
  children,
  onClick,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'text-[#00F3FF]'
          : 'text-zinc-400 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
});

const NetworkBadge = memo(function NetworkBadge() {
  const chainId = useChainId();
  const isMainnet = isProductionMode || MAINNET_CHAIN_IDS.includes(chainId);

  if (isMainnet) {
    return (
      <span className="hidden lg:inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
        Live
      </span>
    );
  }

  return (
    <span className="hidden lg:inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
      Testnet
    </span>
  );
});

export const Header = memo(function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const faucetUrl = isConnected && address
    ? `https://docs.tempo.xyz/quickstart/faucet?address=${address}`
    : 'https://docs.tempo.xyz/quickstart/faucet';

  const isActive = useCallback((path: string) => pathname === path, [pathname]);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex flex-col group">
              <span className="text-xl font-bold tracking-tight leading-none text-white group-hover:text-[#00F3FF] transition-colors">
                PrestoDEX
              </span>
              <span className="text-[10px] text-zinc-500 font-medium tracking-wide">
                Instant swaps on Tempo
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <NavLink href="/swap" isActive={isActive('/swap')}>Swap</NavLink>
              <NavLink href="/liquidity" isActive={isActive('/liquidity')}>Liquidity</NavLink>
              <NavLink href="/analytics" isActive={isActive('/analytics')}>Analytics</NavLink>
              <NavLink href="/transactions" isActive={isActive('/transactions')}>Transactions</NavLink>
            </nav>

            {/* Network Badge - Shows Testnet or Live based on environment/chain */}
            <NetworkBadge />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Faucet Button - Hidden on mobile */}
            <a
              href={faucetUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[#00F3FF]/30 bg-[#00F3FF]/5 px-3 py-1.5 text-xs font-medium text-[#00F3FF] hover:bg-[#00F3FF]/10 transition-all duration-200 btn-press"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Faucet
            </a>

            {/* Connect Button */}
            <div className="[&_button]:!rounded-xl [&_button]:!font-medium [&_button]:!text-sm [&_button]:!h-9 [&_button]:!px-4 [&_button]:transition-all [&_button]:duration-200">
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={`fixed top-16 left-0 right-0 z-40 bg-black/95 border-b border-white/5 md:hidden transform transition-all duration-300 ease-out ${
          mobileMenuOpen
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col p-4 gap-1">
          <MobileNavLink href="/swap" isActive={isActive('/swap')} onClick={closeMobileMenu}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Swap
          </MobileNavLink>
          <MobileNavLink href="/liquidity" isActive={isActive('/liquidity')} onClick={closeMobileMenu}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Liquidity
          </MobileNavLink>
          <MobileNavLink href="/analytics" isActive={isActive('/analytics')} onClick={closeMobileMenu}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Analytics
          </MobileNavLink>
          <MobileNavLink href="/transactions" isActive={isActive('/transactions')} onClick={closeMobileMenu}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Transactions
          </MobileNavLink>
          <a
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
            onClick={closeMobileMenu}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#00F3FF] hover:bg-[#00F3FF]/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Claim Faucet
          </a>
        </nav>
      </div>
    </>
  );
});

const MobileNavLink = memo(function MobileNavLink({
  href,
  isActive,
  children,
  onClick,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
        isActive
          ? 'bg-[#00F3FF]/10 text-[#00F3FF]'
          : 'text-zinc-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
});
