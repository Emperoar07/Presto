'use client';

import { useState, useCallback, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { PrestoDexMotionStaffLogo } from './PrestoDexMotionStaffLogo';

// Network badge configuration
const MAINNET_CHAIN_IDS: number[] = [];
const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';

// Glass button component for floating navigation
const GlassNavButton = memo(function GlassNavButton({
  href,
  isActive,
  children,
  icon,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-300 backdrop-blur-xl border ${
        isActive
          ? 'bg-gradient-to-r from-[#00F3FF]/20 to-[#BC13FE]/20 border-[#00F3FF]/40 text-white shadow-[0_0_20px_rgba(0,243,255,0.3)]'
          : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]'
      }`}
    >
      <span className={`transition-colors ${isActive ? 'text-[#00F3FF]' : 'group-hover:text-[#00F3FF]'}`}>
        {icon}
      </span>
      {children}
    </Link>
  );
});

const NetworkBadge = memo(function NetworkBadge() {
  const chainId = useChainId();
  const isMainnet = isProductionMode || MAINNET_CHAIN_IDS.includes(chainId);

  if (isMainnet) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 backdrop-blur-xl px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
        Live
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 backdrop-blur-xl px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
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

  // Navigation icons
  const swapIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
  const liquidityIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
  const analyticsIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
  const transactionsIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <>
      {/* Floating Header Container - No solid background */}
      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 pt-4">
          {/* Logo - Floating glass container */}
          <div className="pointer-events-auto">
            <Link
              href="/"
              className="flex items-center group rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 px-4 py-2 transition-all duration-300 hover:bg-black/40 hover:border-white/20 hover:shadow-[0_0_30px_rgba(0,243,255,0.15)]"
            >
              <PrestoDexMotionStaffLogo
                width={180}
                height={55}
                withWordmark={true}
                className="text-white"
              />
            </Link>
          </div>

          {/* Center Navigation - Floating glass buttons */}
          {pathname !== '/' && (
            <nav className="hidden md:flex items-center gap-2 pointer-events-auto">
              <GlassNavButton href="/swap" isActive={isActive('/swap')} icon={swapIcon}>
                Swap
              </GlassNavButton>
              <GlassNavButton href="/liquidity" isActive={isActive('/liquidity')} icon={liquidityIcon}>
                Liquidity
              </GlassNavButton>
              <GlassNavButton href="/analytics" isActive={isActive('/analytics')} icon={analyticsIcon}>
                Analytics
              </GlassNavButton>
              <GlassNavButton href="/transactions" isActive={isActive('/transactions')} icon={transactionsIcon}>
                Transactions
              </GlassNavButton>
            </nav>
          )}

          {/* Right side - Floating glass containers */}
          <div className="flex items-center gap-3 pointer-events-auto">
            {/* Network Badge */}
            <div className="hidden lg:block">
              <NetworkBadge />
            </div>

            {/* Faucet Button - Glass style */}
            <a
              href={faucetUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-[#00F3FF]/30 bg-[#00F3FF]/5 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-[#00F3FF] hover:bg-[#00F3FF]/15 hover:border-[#00F3FF]/50 transition-all duration-300 shadow-[0_0_15px_rgba(0,243,255,0.1)] hover:shadow-[0_0_25px_rgba(0,243,255,0.25)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Faucet
            </a>

            {/* Connect Button - Glass wrapper */}
            <div className="rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 p-1 transition-all duration-300 hover:border-white/20 [&_button]:!rounded-xl [&_button]:!font-medium [&_button]:!text-sm [&_button]:!h-9 [&_button]:!px-4 [&_button]:transition-all [&_button]:duration-200">
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            </div>

            {/* Mobile Menu Button */}
            {pathname !== '/' && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-3 rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-black/40 hover:border-white/20 transition-all duration-300"
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
            )}
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {pathname !== '/' && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Menu Panel - Glass style */}
      {pathname !== '/' && (
        <div
          className={`fixed top-24 left-4 right-4 z-40 rounded-3xl bg-black/70 backdrop-blur-2xl border border-white/10 md:hidden transform transition-all duration-300 ease-out shadow-[0_0_50px_rgba(0,0,0,0.5)] ${
            mobileMenuOpen
              ? 'translate-y-0 opacity-100'
              : '-translate-y-4 opacity-0 pointer-events-none'
          }`}
        >
          <nav className="flex flex-col p-4 gap-2">
            <MobileNavLink href="/swap" isActive={isActive('/swap')} onClick={closeMobileMenu}>
              {swapIcon}
              Swap
            </MobileNavLink>
            <MobileNavLink href="/liquidity" isActive={isActive('/liquidity')} onClick={closeMobileMenu}>
              {liquidityIcon}
              Liquidity
            </MobileNavLink>
            <MobileNavLink href="/analytics" isActive={isActive('/analytics')} onClick={closeMobileMenu}>
              {analyticsIcon}
              Analytics
            </MobileNavLink>
            <MobileNavLink href="/transactions" isActive={isActive('/transactions')} onClick={closeMobileMenu}>
              {transactionsIcon}
              Transactions
            </MobileNavLink>
            <a
              href={faucetUrl}
              target="_blank"
              rel="noreferrer"
              onClick={closeMobileMenu}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#00F3FF] bg-[#00F3FF]/5 border border-[#00F3FF]/20 hover:bg-[#00F3FF]/10 transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Claim Faucet
            </a>
            <div className="flex items-center justify-center pt-2">
              <NetworkBadge />
            </div>
          </nav>
        </div>
      )}
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
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
        isActive
          ? 'bg-gradient-to-r from-[#00F3FF]/15 to-[#BC13FE]/15 border border-[#00F3FF]/30 text-white'
          : 'text-zinc-300 hover:bg-white/5 hover:text-white border border-transparent'
      }`}
    >
      {children}
    </Link>
  );
});
