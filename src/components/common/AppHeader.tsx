'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useChainId, useDisconnect, useSwitchChain } from 'wagmi';
import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { FaucetModal } from './FaucetModal';
import { BridgeLogo } from './BridgeLogo';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';
import { getDisplayChainName, getNetworkVisual } from './NetworkBadgeDropdown';
import { arcTestnet } from '@/config/wagmi';
import { baseSepolia, sepolia } from 'wagmi/chains';
import { tempoModerato } from 'viem/chains';

const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';
const MAINNET_CHAIN_IDS: number[] = [];

export const AppHeader = memo(function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chainId = useChainId();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const chainMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const isMainnet = isProductionMode || MAINNET_CHAIN_IDS.includes(chainId);
  const isBridgePage = pathname === '/bridge';
  const faucetLabel = isArcChain(chainId)
    ? 'Open Arc Faucet'
    : isTempoNativeChain(chainId)
      ? 'Open Tempo Faucet'
      : 'Open Testnet Faucet';

  const navLinks = [
    { href: '/swap', label: 'Swap' },
    { href: '/liquidity', label: 'Pools' },
    { href: '/bridge', label: 'Bridge' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/analytics', label: 'Analytics' },
    { href: '/transactions', label: 'Activity' },
  ].filter((link) => {
    if (link.href === '/analytics') return isTempoNativeChain(chainId);
    if (link.href === '/bridge') return pathname === '/bridge' || isArcChain(chainId || arcTestnet.id);
    return true;
  });

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const standardSupportedChains = [arcTestnet, tempoModerato, baseSepolia];
  const bridgeSource = searchParams.get('source') ?? 'arc';
  const bridgeDestination = searchParams.get('destination') ?? 'ethereum-sepolia';
  const bridgeNetworkEntries = [
    { key: 'arc', label: 'Arc Testnet', iconSrc: '/networks/arc.svg', chainId: arcTestnet.id },
    { key: 'ethereum-sepolia', label: 'Ethereum Sepolia', iconSrc: null, chainId: sepolia.id },
    { key: 'base-sepolia', label: 'Base Sepolia', iconSrc: null, chainId: baseSepolia.id },
    { key: 'solana-devnet', label: 'Solana Devnet', iconSrc: null, chainId: null },
  ] as const;
  const activeBridgeEntry = bridgeNetworkEntries.find((entry) => entry.key === bridgeSource) ?? bridgeNetworkEntries[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (chainMenuRef.current && !chainMenuRef.current.contains(target)) {
        setChainMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }

    if (chainMenuOpen || accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen, chainMenuOpen]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-background-dark/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-1.5 text-primary">
                <BridgeLogo size={34} className="text-slate-900 dark:text-white" />
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PrestoDEX</h1>
              </Link>
              <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
                <div className={`h-1.5 w-1.5 rounded-full ${isMainnet ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isMainnet ? 'Mainnet' : 'Testnet'}
                </span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    pathname === link.href
                      ? 'text-primary font-semibold text-sm border-b-2 border-primary pb-1'
                      : 'text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors text-sm font-medium'
                  }
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right section */}
            <div className="flex items-center gap-2">
              {/* Faucet button (testnet only) */}
              {!isMainnet && (
                <button
                  onClick={() => setFaucetModalOpen(true)}
                  className="hidden sm:flex items-center gap-1 rounded-md border border-primary/20 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="material-symbols-outlined text-xs">water_drop</span>
                  {faucetLabel}
                </button>
              )}

              {/* Connect Wallet + Chain Selector */}
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  mounted,
                  openConnectModal,
                }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;
                  const networkVisual = getNetworkVisual(chain?.id);
                  const displayChainName = isBridgePage ? activeBridgeEntry.label : getDisplayChainName(chain?.id, chain?.name);
                  const displayBridgeIcon = isBridgePage ? activeBridgeEntry.iconSrc : null;

                  if (!connected) {
                    return (
                      <button
                        onClick={openConnectModal}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 dark:text-background-dark"
                      >
                        Connect Wallet
                      </button>
                    );
                  }

                  return (
                    <div className="flex items-center gap-2">
                      <div className="relative hidden sm:block" ref={chainMenuRef}>
                        <button
                          onClick={() => {
                            setChainMenuOpen((v) => !v);
                            setAccountMenuOpen(false);
                          }}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          type="button"
                        >
                          {isBridgePage && displayBridgeIcon ? (
                            <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-white/10">
                              <Image
                                src={displayBridgeIcon}
                                alt={`${displayChainName} logo`}
                                width={20}
                                height={20}
                                className="h-5 w-5"
                              />
                            </span>
                          ) : networkVisual ? (
                            <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-white/10">
                              <Image
                                src={networkVisual.iconSrc}
                                alt={`${networkVisual.label} logo`}
                                width={20}
                                height={20}
                                className="h-5 w-5"
                              />
                            </span>
                          ) : (
                            <span className={`h-2 w-2 rounded-full ${'testnet' in chain ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          )}
                          <span>{displayChainName}</span>
                          <span className="material-symbols-outlined text-sm text-slate-400">expand_more</span>
                        </button>

                        {chainMenuOpen && (
                          <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900/95">
                            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {isBridgePage ? 'Bridge Source' : 'Switch Network'}
                            </div>
                            <div className="mt-1 space-y-1">
                              {isBridgePage
                                ? bridgeNetworkEntries.map((bridgeEntry) => {
                                    const isActive = bridgeEntry.key === activeBridgeEntry.key;
                                    return (
                                      <button
                                        key={bridgeEntry.key}
                                        type="button"
                                        disabled={isActive || isSwitchingChain}
                                        onClick={() => {
                                          const params = new URLSearchParams(searchParams.toString());
                                          params.set('source', bridgeEntry.key);
                                          if ((params.get('destination') ?? bridgeDestination) === bridgeEntry.key) {
                                            const fallback = bridgeNetworkEntries.find((entry) => entry.key !== bridgeEntry.key);
                                            if (fallback) params.set('destination', fallback.key);
                                          }
                                          const nextDestination = params.get('destination') ?? bridgeDestination;
                                          if (bridgeSource !== bridgeEntry.key || bridgeDestination !== nextDestination) {
                                            router.replace(`/bridge?${params.toString()}`, { scroll: false });
                                          }
                                          if (bridgeEntry.chainId && chainId !== bridgeEntry.chainId) {
                                            switchChain({ chainId: bridgeEntry.chainId });
                                          }
                                          setChainMenuOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                                          isActive
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                        } disabled:cursor-not-allowed disabled:opacity-70`}
                                      >
                                        <span className="flex items-center gap-2">
                                          {bridgeEntry.iconSrc ? (
                                            <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-white/10">
                                              <Image src={bridgeEntry.iconSrc} alt={`${bridgeEntry.label} logo`} width={20} height={20} className="h-5 w-5" />
                                            </span>
                                          ) : (
                                            <span className="flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-white/10 px-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                              {bridgeEntry.label.slice(0, 2).toUpperCase()}
                                            </span>
                                          )}
                                          <span className="font-medium text-slate-800 dark:text-slate-100">{bridgeEntry.label}</span>
                                        </span>
                                        {isActive ? <span className="material-symbols-outlined text-base text-primary">check</span> : null}
                                      </button>
                                    );
                                  })
                                : standardSupportedChains.map((supportedChain) => {
                                    const supportedVisual = getNetworkVisual(supportedChain.id);
                                    const isActive = supportedChain.id === chain.id;
                                    return (
                                      <button
                                        key={supportedChain.id}
                                        type="button"
                                        disabled={isActive || isSwitchingChain}
                                        onClick={() => {
                                          switchChain({ chainId: supportedChain.id });
                                          setChainMenuOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                                          isActive
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                        } disabled:cursor-not-allowed disabled:opacity-70`}
                                      >
                                        <span className="flex items-center gap-2">
                                          {supportedVisual ? (
                                            <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-white/10">
                                              <Image
                                                src={supportedVisual.iconSrc}
                                                alt={`${supportedVisual.label} logo`}
                                                width={20}
                                                height={20}
                                                className="h-5 w-5"
                                              />
                                            </span>
                                          ) : (
                                            <span className={`h-2 w-2 rounded-full ${supportedChain.testnet ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                          )}
                                          <span className="font-medium text-slate-800 dark:text-slate-100">
                                            {getDisplayChainName(supportedChain.id, supportedChain.name)}
                                          </span>
                                        </span>
                                        {isActive && <span className="material-symbols-outlined text-base text-primary">check</span>}
                                      </button>
                                    );
                                  })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="relative" ref={accountMenuRef}>
                        <button
                          onClick={() => {
                            setAccountMenuOpen((v) => !v);
                            setChainMenuOpen(false);
                          }}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 dark:text-background-dark"
                          type="button"
                        >
                          <span>{account.displayName}</span>
                          <span className="material-symbols-outlined text-sm text-white/80 dark:text-background-dark/70">expand_more</span>
                        </button>

                        {accountMenuOpen && (
                          <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900/95">
                            <div className="px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Wallet
                              </div>
                              <div className="mt-1 break-all font-mono text-xs leading-5 text-slate-800 dark:text-slate-100">
                                {account.address}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(account.address);
                                setAccountMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <span className="material-symbols-outlined text-base">content_copy</span>
                              Copy Address
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                disconnect();
                                setAccountMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                            >
                              <span className="material-symbols-outlined text-base">logout</span>
                              Disconnect
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              </ConnectButton.Custom>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400"
              >
                <span className="material-symbols-outlined text-xl">
                  {mobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className={`block py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {isBridgePage ? 'Bridge Source' : 'Network'}
              </p>
              <div className="space-y-2">
                {isBridgePage
                  ? bridgeNetworkEntries.map((bridgeEntry) => {
                      const isActiveChain = bridgeEntry.key === activeBridgeEntry.key;
                      return (
                        <button
                          key={bridgeEntry.key}
                          type="button"
                          disabled={isActiveChain || isSwitchingChain}
                          onClick={() => {
                            const params = new URLSearchParams(searchParams.toString());
                            params.set('source', bridgeEntry.key);
                            if ((params.get('destination') ?? bridgeDestination) === bridgeEntry.key) {
                              const fallback = bridgeNetworkEntries.find((entry) => entry.key !== bridgeEntry.key);
                              if (fallback) params.set('destination', fallback.key);
                            }
                            const nextDestination = params.get('destination') ?? bridgeDestination;
                            if (bridgeSource !== bridgeEntry.key || bridgeDestination !== nextDestination) {
                              router.replace(`/bridge?${params.toString()}`, { scroll: false });
                            }
                            if (bridgeEntry.chainId && chainId !== bridgeEntry.chainId) {
                              switchChain({ chainId: bridgeEntry.chainId });
                            }
                            closeMobileMenu();
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActiveChain
                              ? 'bg-primary/10 text-primary'
                              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span className="flex items-center gap-2">
                            {bridgeEntry.iconSrc ? (
                              <Image src={bridgeEntry.iconSrc} alt={`${bridgeEntry.label} logo`} width={18} height={18} className="rounded-sm" />
                            ) : (
                              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-primary/10 px-1 text-[10px] font-bold">
                                {bridgeEntry.label.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            {bridgeEntry.label}
                          </span>
                          {isActiveChain ? <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Active</span> : null}
                        </button>
                      );
                    })
                  : standardSupportedChains.map((stdChain) => {
                      const stdVisual = getNetworkVisual(stdChain.id);
                      const isActiveChain = chainId === stdChain.id;
                      return (
                        <button
                          key={stdChain.id}
                          type="button"
                          disabled={isActiveChain || isSwitchingChain}
                          onClick={() => {
                            switchChain({ chainId: stdChain.id });
                            closeMobileMenu();
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActiveChain
                              ? 'bg-primary/10 text-primary'
                              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span className="flex items-center gap-2">
                            {stdVisual ? (
                              <Image src={stdVisual.iconSrc} alt={`${stdVisual.label} logo`} width={18} height={18} className="rounded-sm" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-primary" />
                            )}
                            {getDisplayChainName(stdChain.id)}
                          </span>
                          {isActiveChain ? <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Active</span> : null}
                        </button>
                      );
                    })}
              </div>
            </div>
            {!isMainnet && (
              <button
                onClick={() => { setFaucetModalOpen(true); closeMobileMenu(); }}
                className="block w-full text-left py-2 px-3 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                {faucetLabel}
              </button>
            )}
          </div>
        )}
      </header>

      <FaucetModal isOpen={faucetModalOpen} onClose={() => setFaucetModalOpen(false)} />
    </>
  );
});
