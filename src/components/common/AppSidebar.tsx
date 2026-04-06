'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useEffect, useRef, useState } from 'react';
import { useChainId, useDisconnect, useSwitchChain } from 'wagmi';
import { baseSepolia, sepolia } from 'wagmi/chains';
import { FaucetModal } from './FaucetModal';
import { getDisplayChainName, getNetworkVisual } from './NetworkBadgeDropdown';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';
import { arcTestnet } from '@/config/wagmi';
import { useSidebar } from './SidebarContext';

const isProductionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'true';
const MAINNET_CHAIN_IDS: number[] = [];

const COLLAPSED_W = 64;
const EXPANDED_W = 220;

function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="16" r="15" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.5" fill="#25c0f4" fillOpacity="0.08" />
      <circle cx="16" cy="16" r="10" stroke="#25c0f4" strokeWidth="1.5" strokeOpacity="0.7" fill="none" />
      <circle cx="16" cy="16" r="4.5" fill="#25c0f4" />
    </svg>
  );
}

type NavLink = {
  href: string;
  label: string;
  icon: string;
  section: 'trade' | 'account' | 'insights';
};

const NAV_LINKS: NavLink[] = [
  { href: '/swap', label: 'Swap', icon: 'swap_horiz', section: 'trade' },
  { href: '/liquidity', label: 'Pools', icon: 'water', section: 'trade' },
  { href: '/bridge', label: 'Bridge', icon: 'swap_horizontal_circle', section: 'trade' },
  { href: '/portfolio', label: 'Portfolio', icon: 'pie_chart', section: 'account' },
  { href: '/transactions', label: 'Activity', icon: 'history', section: 'account' },
  { href: '/analytics', label: 'Analytics', icon: 'bar_chart', section: 'insights' },
];

export const AppSidebar = memo(function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { collapsed, toggle } = useSidebar();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [walletDropdownPos, setWalletDropdownPos] = useState<{ bottom: number; left: number } | null>(null);

  const chainMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const walletBtnRef = useRef<HTMLButtonElement>(null);
  const walletDropdownRef = useRef<HTMLDivElement>(null);

  const isMainnet = isProductionMode || MAINNET_CHAIN_IDS.includes(chainId);
  const isBridgePage = pathname === '/bridge';
  const isDocsPage = pathname === '/docs';
  const bridgeSource = searchParams.get('source') ?? 'arc';
  const bridgeDestination = searchParams.get('destination') ?? 'ethereum-sepolia';

  const bridgeNetworkEntries = [
    { key: 'arc', label: 'Arc Testnet', iconSrc: '/networks/arc.svg', chainId: arcTestnet.id },
    { key: 'ethereum-sepolia', label: 'Ethereum Sepolia', iconSrc: null, chainId: sepolia.id },
    { key: 'base-sepolia', label: 'Base Sepolia', iconSrc: null, chainId: baseSepolia.id },
    { key: 'solana-devnet', label: 'Solana Devnet', iconSrc: null, chainId: null },
  ] as const;
  const activeBridgeEntry = bridgeNetworkEntries.find((e) => e.key === bridgeSource) ?? bridgeNetworkEntries[0];
  const standardSupportedChains = [arcTestnet, baseSepolia];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (chainMenuRef.current && !chainMenuRef.current.contains(target)) setChainMenuOpen(false);
      if (
        accountMenuRef.current && !accountMenuRef.current.contains(target) &&
        walletBtnRef.current && !walletBtnRef.current.contains(target) &&
        walletDropdownRef.current && !walletDropdownRef.current.contains(target)
      ) {
        setAccountMenuOpen(false);
      }
    }
    if (chainMenuOpen || accountMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen, chainMenuOpen]);

  const navLinks = NAV_LINKS.filter((link) => {
    if (link.href === '/analytics') return isTempoNativeChain(chainId);
    if (link.href === '/bridge') return pathname === '/bridge' || isArcChain(chainId || arcTestnet.id);
    return true;
  });
  const tradeLinks = navLinks.filter((l) => l.section === 'trade');
  const accountLinks = navLinks.filter((l) => l.section === 'account');
  const insightLinks = navLinks.filter((l) => l.section === 'insights');

  // Inline chain list used inside collapsed wallet dropdown
  const ChainList = () => (
    <div className="space-y-0.5">
      {isBridgePage
        ? bridgeNetworkEntries.map((entry) => {
            const isActive = entry.key === activeBridgeEntry.key;
            return (
              <button
                key={entry.key}
                type="button"
                disabled={isActive || isSwitchingChain}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('source', entry.key);
                  if ((params.get('destination') ?? bridgeDestination) === entry.key) {
                    const fallback = bridgeNetworkEntries.find((c) => c.key !== entry.key);
                    if (fallback) params.set('destination', fallback.key);
                  }
                  const nextDest = params.get('destination') ?? bridgeDestination;
                  if (bridgeSource !== entry.key || bridgeDestination !== nextDest) {
                    router.replace(`/bridge?${params.toString()}`, { scroll: false });
                  }
                  if (entry.chainId && chainId !== entry.chainId) switchChain({ chainId: entry.chainId });
                  setChainMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/[0.04]'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="flex items-center gap-2">
                  {entry.iconSrc
                    ? <Image src={entry.iconSrc} alt={entry.label} width={14} height={14} className="rounded-sm" />
                    : <span className="flex size-4 items-center justify-center rounded-[4px] bg-white/10 text-[8px] font-bold text-slate-300">{entry.label.slice(0, 2).toUpperCase()}</span>
                  }
                  <span className="font-medium">{entry.label}</span>
                </span>
                {isActive ? <span className="material-symbols-outlined text-[13px] text-primary">check</span> : null}
              </button>
            );
          })
        : standardSupportedChains.map((sc) => {
            const visual = getNetworkVisual(sc.id);
            const isActive = sc.id === chainId;
            return (
              <button
                key={sc.id}
                type="button"
                disabled={isActive || isSwitchingChain}
                onClick={() => { switchChain({ chainId: sc.id }); setChainMenuOpen(false); }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/[0.04]'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="flex items-center gap-2">
                  {visual
                    ? <Image src={visual.iconSrc} alt={visual.label} width={14} height={14} className="rounded-sm" />
                    : <span className={`size-2 rounded-full ${sc.testnet ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  }
                  <span className="font-medium">{getDisplayChainName(sc.id, sc.name)}</span>
                </span>
                {isActive ? <span className="material-symbols-outlined text-[13px] text-primary">check</span> : null}
              </button>
            );
          })}
    </div>
  );

  // Chain menu dropdown (expanded sidebar)
  const ChainMenuDropdown = () => (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-white/[0.08] bg-[#111c2d] p-1.5 shadow-2xl">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {isBridgePage ? 'Bridge Source' : 'Switch Network'}
      </div>
      <div className="mt-0.5">
        <ChainList />
      </div>
    </div>
  );

  // Nav item — collapsed: icon only (label shrinks to w-0). Expanded: icon + label.
  const NavItem = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        title={label}
        onClick={() => setMobileOpen(false)}
        className={`group relative mb-0.5 flex items-center gap-2.5 rounded-[10px] border px-[10px] py-[9px] transition-all duration-200 ${
          isActive ? 'border-primary/15 bg-primary/10' : 'border-transparent hover:bg-white/[0.04]'
        }`}
      >
        <span className={`material-symbols-outlined flex-shrink-0 text-[18px] ${isActive ? 'text-primary' : 'text-slate-500 group-hover:text-slate-300'}`}>
          {icon}
        </span>
        <span className={`overflow-hidden whitespace-nowrap text-[13.5px] font-medium transition-all duration-200 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'} ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-100'}`}>
          {label}
        </span>
      </Link>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => {
    if (collapsed) return null;
    return <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</p>;
  };

  const sidebarInner = (
    <div className="flex h-full flex-col">
      {/* ── Collapse toggle ── */}
      <div className="flex items-center justify-center border-b border-white/[0.07] px-2 py-2">
        <button
          type="button"
          onClick={toggle}
          className="group relative flex w-full items-center justify-center rounded-[10px] py-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
        >
          <span
            className="material-symbols-outlined text-[18px] transition-transform duration-300"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            chevron_left
          </span>
          <span
            className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      </div>

      {/* ── Nav links ── */}
      {isDocsPage ? (
        <div className="flex-1 px-2 py-4 space-y-1">
          <NavItem href="/" label="Home" icon="home" />
          <NavItem href="/swap" label="Launch App" icon="rocket_launch" />
        </div>
      ) : (
        <>
          <nav className="flex-1 space-y-4 overflow-hidden px-2 py-4">
            {tradeLinks.length > 0 && (
              <div>
                <SectionLabel label="Trade" />
                {tradeLinks.map((l) => <NavItem key={l.href} href={l.href} label={l.label} icon={l.icon} />)}
              </div>
            )}
            {accountLinks.length > 0 && (
              <div>
                <SectionLabel label="Account" />
                {accountLinks.map((l) => <NavItem key={l.href} href={l.href} label={l.label} icon={l.icon} />)}
              </div>
            )}
            {insightLinks.length > 0 && (
              <div>
                <SectionLabel label="Insights" />
                {insightLinks.map((l) => <NavItem key={l.href} href={l.href} label={l.label} icon={l.icon} />)}
              </div>
            )}
          </nav>

          {/* ── Wallet area ── */}
          <div className="border-t border-white/[0.07] px-2 pb-3 pt-3 space-y-2">
            <ConnectButton.Custom>
              {({ account, chain, mounted, openConnectModal }) => {
                const connected = mounted && account && chain;
                const networkVisual = getNetworkVisual(chain?.id);
                const displayChainName = isBridgePage ? activeBridgeEntry.label : getDisplayChainName(chain?.id, chain?.name);
                const displayBridgeIcon = isBridgePage ? activeBridgeEntry.iconSrc : null;

                if (!connected) {
                  return collapsed ? (
                    <button
                      onClick={openConnectModal}
                      title="Connect Wallet"
                      type="button"
                      className="group relative flex w-full items-center justify-center rounded-[10px] bg-primary p-[9px] transition-opacity hover:opacity-90"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#0f172a]">account_balance_wallet</span>
                      <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                        style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Connect Wallet
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={openConnectModal}
                      type="button"
                      className="w-full rounded-[10px] bg-primary py-[10px] text-[13px] font-bold text-[#0f172a] transition-opacity hover:opacity-90"
                    >
                      Connect Wallet
                    </button>
                  );
                }

                if (collapsed) {
                  return (
                    <div className="relative" ref={accountMenuRef}>
                      <button
                        ref={walletBtnRef}
                        onClick={() => {
                          if (!accountMenuOpen && walletBtnRef.current) {
                            const rect = walletBtnRef.current.getBoundingClientRect();
                            setWalletDropdownPos({ bottom: window.innerHeight - rect.bottom, left: rect.right + 8 });
                          }
                          setAccountMenuOpen((c) => !c);
                          setChainMenuOpen(false);
                        }}
                        title={account.displayName}
                        type="button"
                        className="flex w-full items-center justify-center rounded-[10px] bg-primary p-[9px] transition-opacity hover:opacity-90"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#0f172a]">person</span>
                      </button>
                      {accountMenuOpen && walletDropdownPos && (
                        <div
                          ref={walletDropdownRef}
                          className="fixed z-[200] w-52 rounded-xl border border-white/[0.08] bg-[#111c2d] p-1.5 shadow-2xl"
                          style={{ bottom: walletDropdownPos.bottom, left: walletDropdownPos.left }}
                        >
                          {/* Chain switcher */}
                          <div ref={chainMenuRef}>
                            <button
                              type="button"
                              onClick={() => setChainMenuOpen((c) => !c)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-slate-300 hover:bg-white/[0.04]"
                            >
                              {displayBridgeIcon
                                ? <Image src={displayBridgeIcon} alt={displayChainName} width={14} height={14} className="rounded-sm" />
                                : networkVisual
                                  ? <Image src={networkVisual.iconSrc} alt={networkVisual.label} width={14} height={14} className="rounded-sm" />
                                  : <span className="size-[7px] rounded-full bg-amber-500" />
                              }
                              <span className="flex-1 truncate text-left">{displayChainName}</span>
                              <span className="material-symbols-outlined text-[14px] text-slate-500">unfold_more</span>
                            </button>
                            {chainMenuOpen && (
                              <div className="mt-1 rounded-lg border border-white/[0.06] bg-[#0f172a] p-1">
                                <ChainList />
                              </div>
                            )}
                          </div>
                          {/* Account info */}
                          <div className="border-t border-white/[0.06] px-2.5 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Wallet</div>
                            <div className="mt-1 break-all font-mono text-[11px] text-slate-300">{account.address}</div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => { await navigator.clipboard.writeText(account.address); setAccountMenuOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-slate-300 hover:bg-white/[0.04]"
                          >
                            <span className="material-symbols-outlined text-[15px]">content_copy</span>
                            Copy Address
                          </button>
                          <button
                            type="button"
                            onClick={() => { disconnect(); setAccountMenuOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-red-400 hover:bg-red-500/10"
                          >
                            <span className="material-symbols-outlined text-[15px]">logout</span>
                            Disconnect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Expanded wallet UI
                return (
                  <div className="space-y-2">
                    <div className="relative" ref={chainMenuRef}>
                      <button
                        onClick={() => { setChainMenuOpen((c) => !c); setAccountMenuOpen(false); }}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[10px] border border-white/[0.07] bg-[#263347] px-[10px] py-[9px] text-[12px] font-semibold text-slate-300 transition-colors hover:border-primary/25"
                      >
                        {displayBridgeIcon
                          ? <Image src={displayBridgeIcon} alt={displayChainName} width={14} height={14} className="rounded-sm" />
                          : networkVisual
                            ? <Image src={networkVisual.iconSrc} alt={networkVisual.label} width={14} height={14} className="rounded-sm" />
                            : <span className="size-[7px] rounded-full bg-amber-500" />
                        }
                        <span className="flex-1 truncate text-left">{displayChainName}</span>
                        <span className="material-symbols-outlined text-[14px] text-slate-500">unfold_more</span>
                      </button>
                      {chainMenuOpen && <ChainMenuDropdown />}
                    </div>
                    <div className="relative" ref={accountMenuRef}>
                      <button
                        onClick={() => { setAccountMenuOpen((c) => !c); setChainMenuOpen(false); }}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[10px] bg-primary px-3 py-[9px] text-[13px] font-bold text-[#0f172a] transition-opacity hover:opacity-90"
                      >
                        <span className="flex-1 truncate text-left">{account.displayName}</span>
                        <span className="material-symbols-outlined text-[14px] opacity-70">expand_more</span>
                      </button>
                      {accountMenuOpen && (
                        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-white/[0.08] bg-[#111c2d] p-1.5 shadow-2xl">
                          <div className="px-2.5 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Wallet</div>
                            <div className="mt-1 break-all font-mono text-[11px] text-slate-300">{account.address}</div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => { await navigator.clipboard.writeText(account.address); setAccountMenuOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-slate-300 hover:bg-white/[0.04]"
                          >
                            <span className="material-symbols-outlined text-[15px]">content_copy</span>
                            Copy Address
                          </button>
                          <button
                            type="button"
                            onClick={() => { disconnect(); setAccountMenuOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-red-400 hover:bg-red-500/10"
                          >
                            <span className="material-symbols-outlined text-[15px]">logout</span>
                            Disconnect
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            </ConnectButton.Custom>

            {!isMainnet && (
              <button type="button" onClick={() => setFaucetModalOpen(true)} className="hidden">
                Open Faucet
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* ── Logo strip — always 220px, never collapses ── */}
      <div className="fixed left-0 top-0 z-50 hidden md:flex h-[58px] items-center gap-2.5 border-b border-r border-white/[0.07] bg-[#1e293b] px-5" style={{ width: EXPANDED_W }}>
        <Link href="/" className="flex items-center gap-2 select-none">
          <LogoMark />
          <span className="text-[16px] font-extrabold tracking-tight text-white whitespace-nowrap">Presto</span>
        </Link>
        <span
          className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#25c0f4] whitespace-nowrap"
          style={{ background: 'rgba(37,192,244,0.1)', border: '1px solid rgba(37,192,244,0.2)' }}
        >
          Testnet
        </span>
      </div>

      {/* ── Nav aside — collapses from 220px to 64px below the logo strip ── */}
      <aside
        className="fixed left-0 bottom-0 z-40 hidden md:flex md:flex-col border-r border-white/[0.07] bg-[#1e293b]"
        style={{
          top: 58,
          width: collapsed ? COLLAPSED_W : EXPANDED_W,
          transition: 'width 0.25s ease',
        }}
      >
        {sidebarInner}
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-white/[0.07] bg-[#1e293b]/95 px-4 backdrop-blur-md md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[14px] font-extrabold text-white">Presto</span>
        </Link>
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#25c0f4]"
          style={{ background: 'rgba(37,192,244,0.1)', border: '1px solid rgba(37,192,244,0.2)' }}>
          Testnet
        </span>
        <div className="ml-auto" />
        <button type="button" onClick={() => setMobileOpen((c) => !c)} className="rounded-lg p-2 text-slate-300">
          <span className="material-symbols-outlined text-xl">{mobileOpen ? 'close' : 'menu'}</span>
        </button>
      </header>

      {/* ── Mobile nav overlay (always full 220px, no collapse on mobile) ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-[220px] pt-14 overflow-hidden">
            <div style={{ width: EXPANDED_W, height: '100%' }}>
              {sidebarInner}
            </div>
          </div>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <FaucetModal isOpen={faucetModalOpen} onClose={() => setFaucetModalOpen(false)} />
    </>
  );
});
