'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address, type PublicClient } from 'viem';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { getHubToken, getTokens, isHubToken, type Token } from '@/config/tokens';
import {
  getUniswapV2Addresses,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
} from '@/config/contracts';
import { approveToken, getTokenBalance } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';

const ZERO = '0x0000000000000000000000000000000000000000';
const SURF = '#1e293b';
const USDC_COLOR = '#3b82f6';
const USDC_LABEL = 'US';
const SLIPPAGE_BPS = 100n; // 1%

// cirBTC is the one token with no Hub-AMM pool (it can't be priced 1:1), so its
// local market lives in the Uniswap fork and is surfaced here.
const FORK_LIQUIDITY_SYMBOLS = new Set(['cirbtc']);

type ForkPool = {
  token: Token;
  hub: Token;
  pair: Address;
  reserveToken: bigint;
  reserveHub: bigint;
  totalSupply: bigint;
  userLp: bigint;
  userTokenBal: bigint;
  userHubBal: bigint;
};

const fmtUsd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`);
const trimNum = (n: number, max = 6) => Number(n.toFixed(max)).toString();

export function UniswapForkPools() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const fork = getUniswapV2Addresses(chainId);
  const hub = getHubToken(chainId);

  const [pools, setPools] = useState<ForkPool[]>([]);
  const [openPair, setOpenPair] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [addToken, setAddToken] = useState('');
  const [addHub, setAddHub] = useState('');
  const [removeLp, setRemoveLp] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const reqId = useRef(0);

  const loadPools = useCallback(async () => {
    // Transient: client not ready / unsupported chain — don't clobber existing rows.
    if (!publicClient || !fork || !hub) return;
    const id = ++reqId.current;
    try {
      const candidates = getTokens(chainId).filter(
        (t) => !isHubToken(t, chainId) && FORK_LIQUIDITY_SYMBOLS.has(t.symbol.toLowerCase())
      );
      const results = await Promise.all(
        candidates.map(async (token): Promise<ForkPool | null> => {
          const pair = (await publicClient.readContract({
            address: fork.factory, abi: UNISWAP_V2_FACTORY_ABI, functionName: 'getPair', args: [token.address, hub.address],
          })) as Address;
          if (!pair || pair.toLowerCase() === ZERO) return null;

          const [reserves, token0, totalSupply, userLp] = await Promise.all([
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'getReserves' }) as Promise<readonly [bigint, bigint, number]>,
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'token0' }) as Promise<Address>,
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
            address ? (publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>) : Promise.resolve(0n),
          ]);
          const tokenIsToken0 = token0.toLowerCase() === token.address.toLowerCase();
          const reserveToken = tokenIsToken0 ? reserves[0] : reserves[1];
          const reserveHub = tokenIsToken0 ? reserves[1] : reserves[0];

          let userTokenBal = 0n;
          let userHubBal = 0n;
          if (address) {
            const [tb, hb] = await Promise.all([
              getTokenBalance(publicClient as PublicClient, address, token.address, token.decimals),
              getTokenBalance(publicClient as PublicClient, address, hub.address, hub.decimals),
            ]);
            userTokenBal = parseUnits(tb || '0', token.decimals);
            userHubBal = parseUnits(hb || '0', hub.decimals);
          }
          return { token, hub, pair, reserveToken, reserveHub, totalSupply, userLp, userTokenBal, userHubBal };
        })
      );
      if (id !== reqId.current) return; // a newer load superseded this one
      setPools(results.filter((p): p is ForkPool => p !== null));
    } catch (e) {
      // Keep the last good rows on transient RPC errors (e.g. rate limits).
      console.error('Failed to load fork pools', e);
    }
  }, [publicClient, fork, hub, chainId, address]);

  useEffect(() => { loadPools(); }, [loadPools, refreshKey]);

  if (!fork || !hub || pools.length === 0) return null;

  const ratioHubPerToken = (pool: ForkPool) => {
    const rt = Number(formatUnits(pool.reserveToken, pool.token.decimals));
    const rh = Number(formatUnits(pool.reserveHub, pool.hub.decimals));
    return rt > 0 ? rh / rt : 0;
  };

  const onAddTokenChange = (pool: ForkPool, v: string) => {
    if (!/^\d*\.?\d*$/.test(v)) return;
    setAddToken(v);
    const n = Number.parseFloat(v);
    const r = ratioHubPerToken(pool);
    setAddHub(Number.isFinite(n) && n > 0 && r > 0 ? (n * r).toFixed(6) : '');
  };
  const onAddHubChange = (pool: ForkPool, v: string) => {
    if (!/^\d*\.?\d*$/.test(v)) return;
    setAddHub(v);
    const n = Number.parseFloat(v);
    const r = ratioHubPerToken(pool);
    setAddToken(Number.isFinite(n) && n > 0 && r > 0 ? (n / r).toFixed(Math.min(pool.token.decimals, 8)) : '');
  };

  const handleAdd = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    if (!addToken || Number(addToken) <= 0 || !addHub || Number(addHub) <= 0) return toast.error('Enter an amount');
    const tokenDesired = parseUnits(addToken, pool.token.decimals);
    const hubDesired = parseUnits(addHub, pool.hub.decimals);
    if (tokenDesired > pool.userTokenBal) return toast.error(`Insufficient ${pool.token.symbol}`);
    if (hubDesired > pool.userHubBal) return toast.error(`Insufficient ${pool.hub.symbol}`);
    const tokenMin = tokenDesired - (tokenDesired * SLIPPAGE_BPS) / 10000n;
    const hubMin = hubDesired - (hubDesired * SLIPPAGE_BPS) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    setBusy(true);
    try {
      await approveToken(walletClient, publicClient, address, pool.token.address, fork.router, tokenDesired);
      await approveToken(walletClient, publicClient, address, pool.hub.address, fork.router, hubDesired);
      const hash = await walletClient.writeContract({
        address: fork.router, abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI, functionName: 'addLiquidity',
        args: [pool.token.address, pool.hub.address, tokenDesired, hubDesired, tokenMin, hubMin, address, deadline],
        account: address, chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setAddToken(''); setAddHub('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to add liquidity');
    } finally { setBusy(false); }
  };

  const handleRemove = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    if (!removeLp || Number(removeLp) <= 0) return toast.error('Enter an LP amount');
    let liquidity = parseUnits(removeLp, 18);
    if (liquidity > pool.userLp) liquidity = pool.userLp;
    if (liquidity <= 0n) return toast.error('No LP position');
    if (pool.totalSupply <= 0n) return toast.error('Pool has no liquidity');
    const expectedTokenOut = (pool.reserveToken * liquidity) / pool.totalSupply;
    const expectedHubOut = (pool.reserveHub * liquidity) / pool.totalSupply;
    const tokenMin = expectedTokenOut - (expectedTokenOut * SLIPPAGE_BPS) / 10000n;
    const hubMin = expectedHubOut - (expectedHubOut * SLIPPAGE_BPS) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    setBusy(true);
    try {
      await approveToken(walletClient, publicClient, address, pool.pair, fork.router, liquidity);
      const hash = await walletClient.writeContract({
        address: fork.router, abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI, functionName: 'removeLiquidity',
        args: [pool.token.address, pool.hub.address, liquidity, tokenMin, hubMin, address, deadline],
        account: address, chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Liquidity removed" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setRemoveLp('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to remove liquidity');
    } finally { setBusy(false); }
  };

  return (
    <>
      {pools.map((pool) => {
        const isOpen = openPair === pool.pair;
        const sharePct = pool.totalSupply > 0n ? (Number(pool.userLp) / Number(pool.totalSupply)) * 100 : 0;
        const reserveTokenDisp = Number(formatUnits(pool.reserveToken, pool.token.decimals));
        const reserveHubDisp = Number(formatUnits(pool.reserveHub, pool.hub.decimals));
        const tvl = reserveHubDisp * 2;
        const lpBalance = Number(formatUnits(pool.userLp, 18));
        const posValue = (tvl * sharePct) / 100;
        const rate = reserveTokenDisp > 0 ? reserveHubDisp / reserveTokenDisp : 0;

        // Est. LP for the entered add amount.
        let estLp = '--';
        if (addToken && Number(addToken) > 0 && pool.reserveToken > 0n && pool.totalSupply > 0n) {
          const minted = (parseUnits(addToken, pool.token.decimals) * pool.totalSupply) / pool.reserveToken;
          estLp = Number(formatUnits(minted, 18)).toFixed(4);
        }
        // "You receive" for the entered remove amount.
        let recvSummary = '--';
        if (removeLp && Number(removeLp) > 0 && pool.totalSupply > 0n) {
          const liq = parseUnits(removeLp, 18);
          const tOut = (liq * pool.reserveToken) / pool.totalSupply;
          const hOut = (liq * pool.reserveHub) / pool.totalSupply;
          recvSummary = `${trimNum(Number(formatUnits(tOut, pool.token.decimals)))} ${pool.token.symbol} · ${trimNum(Number(formatUnits(hOut, pool.hub.decimals)), 2)} ${pool.hub.symbol}`;
        }
        const presetRemove = (f: number) => setRemoveLp(trimNum(lpBalance * f, 8));

        const statItems = [
          { label: 'Value', value: fmtUsd(posValue) },
          { label: 'Liquidity', value: fmtUsd(tvl) },
          { label: '24h Vol', value: '—' },
          { label: 'Reserves', value: `${trimNum(reserveTokenDisp)} ${pool.token.symbol} · ${trimNum(reserveHubDisp, 2)} ${pool.hub.symbol}` },
          { label: 'Rate', value: rate > 0 ? `1 ${pool.token.symbol} ≈ ${rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${pool.hub.symbol}` : '--' },
        ];

        return (
          <div key={pool.pair} className="border-b border-white/[0.04] last:border-b-0" style={{ background: isOpen ? 'rgba(37,192,244,0.04)' : 'transparent' }}>
            <button
              type="button"
              onClick={() => { setOpenPair(isOpen ? null : pool.pair); setMode('add'); setAddToken(''); setAddHub(''); setRemoveLp(''); }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02] md:grid md:gap-3.5 md:px-5"
              style={{ gridTemplateColumns: 'auto 1fr 140px 140px 124px' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex h-6 w-10 flex-shrink-0">
                  {[{ bg: '#f7931a', lbl: 'cB' }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                    <div key={idx} className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                      style={{ background: ic.bg, left: idx === 0 ? 0 : 14, zIndex: idx === 0 ? 1 : 0, border: `2px solid ${SURF}` }}>
                      {ic.lbl}
                    </div>
                  ))}
                </div>
                <div className="min-w-0 md:hidden">
                  <p className="text-[13px] font-bold text-slate-100">{pool.token.symbol} / {pool.hub.symbol}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{fmtUsd(tvl)} liquidity</p>
                </div>
              </div>
              <div className="hidden md:block">
                <p className="text-[13px] font-bold text-slate-100">{pool.token.symbol} / {pool.hub.symbol}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Uniswap V2 · 0.3%</p>
              </div>
              <div className="hidden md:block">
                <p className="text-[13px] font-semibold text-slate-100">{fmtUsd(tvl)}</p>
                <p className="text-[11px] text-slate-500">Liquidity</p>
              </div>
              <div className="hidden md:block">
                <p className="text-[13px] font-semibold text-slate-100">{sharePct > 0 ? `${sharePct.toFixed(2)}%` : '—'}</p>
                <p className="text-[11px] text-slate-500">Your share</p>
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className="hidden rounded-[10px] bg-[#25c0f4] px-3 py-2 text-[12px] font-bold text-[#0f172a] md:inline-block">
                  {isOpen ? 'Hide Manager' : lpBalance > 0 ? 'Manage' : 'Add Liquidity'}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 md:px-5">
                <div className="mt-2 overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#182336]">
                  <div className="flex flex-col gap-2 px-3 py-2.5">
                    {/* header */}
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative flex h-6 w-9 flex-shrink-0">
                          {[{ bg: '#f7931a', lbl: 'cB' }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                            <div key={idx} className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-extrabold text-white"
                              style={{ background: ic.bg, left: idx === 0 ? 0 : 14, zIndex: idx === 0 ? 1 : 0, border: '2px solid #182336' }}>
                              {ic.lbl}
                            </div>
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-extrabold text-slate-50">{pool.token.symbol} / {pool.hub.symbol}</p>
                          <p className="text-[10px] text-slate-500">Uniswap V2 · 0.3%</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-full bg-[#153b37] px-2 py-0.5 text-[10px] font-bold text-emerald-400">LP {lpBalance.toFixed(4)}</span>
                        <span className="inline-flex rounded-full bg-[#16384b] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]">{sharePct.toFixed(2)}%</span>
                        <div className="flex rounded-[8px] border border-white/[0.08] bg-[#1e293b] p-0.5">
                          {(['add', 'remove'] as const).map((m) => (
                            <button key={m} type="button" onClick={() => setMode(m)}
                              className="rounded-[6px] px-2.5 py-1 text-[11px] font-bold transition-all capitalize"
                              style={mode === m ? { background: m === 'add' ? '#25c0f4' : '#f87171', color: m === 'add' ? '#09111d' : '#130d12' } : { color: '#94a3b8' }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* stats */}
                    <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
                      <div className="grid divide-y divide-white/[0.06] md:grid-cols-5 md:divide-x md:divide-y-0">
                        {statItems.map((item) => (
                          <div key={item.label} className="px-3 py-1.5">
                            <p className="text-[9px] text-slate-500">{item.label}</p>
                            <p className="mt-0.5 text-[12px] font-bold text-slate-50">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {mode === 'add' ? (
                      <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
                        <div className="grid gap-2 border-b border-white/[0.06] px-3 py-2 md:grid-cols-2">
                          <div className="rounded-[8px] border border-white/[0.06] bg-[#11192a] px-3 py-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{pool.token.symbol} wallet</p>
                            <p className="mt-0.5 text-[13px] font-extrabold text-slate-50">{Number(formatUnits(pool.userTokenBal, pool.token.decimals)).toFixed(6)}</p>
                          </div>
                          <div className="rounded-[8px] border border-white/[0.06] bg-[#11192a] px-3 py-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{pool.hub.symbol} wallet</p>
                            <p className="mt-0.5 text-[13px] font-extrabold text-slate-50">{Number(formatUnits(pool.userHubBal, pool.hub.decimals)).toFixed(4)}</p>
                          </div>
                        </div>
                        <div className="grid gap-2 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_130px] xl:items-end">
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <label className="text-[10px] text-slate-500">{pool.token.symbol} amount</label>
                              <button type="button" onClick={() => onAddTokenChange(pool, formatUnits(pool.userTokenBal, pool.token.decimals))}
                                className="rounded-full border border-[#25c0f4]/25 bg-[#0d2237] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]">Max</button>
                            </div>
                            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2">
                              <input type="number" value={addToken} onChange={(e) => onAddTokenChange(pool, e.target.value)} placeholder="0.0"
                                className="w-full bg-transparent text-[14px] font-extrabold text-slate-100 outline-none placeholder:text-slate-700" />
                              <span className="shrink-0 rounded-full border border-white/10 bg-[#1e293b] px-2.5 py-1 text-[10px] font-bold text-slate-100">{pool.token.symbol}</span>
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <label className="text-[10px] text-slate-500">{pool.hub.symbol} amount</label>
                              <button type="button" onClick={() => onAddHubChange(pool, formatUnits(pool.userHubBal, pool.hub.decimals))}
                                className="rounded-full border border-[#25c0f4]/25 bg-[#0d2237] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]">Max</button>
                            </div>
                            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2">
                              <input type="number" value={addHub} onChange={(e) => onAddHubChange(pool, e.target.value)} placeholder="0.0"
                                className="w-full bg-transparent text-[14px] font-extrabold text-slate-100 outline-none placeholder:text-slate-700" />
                              <span className="shrink-0 rounded-full border border-white/10 bg-[#1e293b] px-2.5 py-1 text-[10px] font-bold text-slate-100">{pool.hub.symbol}</span>
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">Est. LP</p>
                            <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">{estLp}</div>
                          </div>
                          <button type="button" onClick={() => handleAdd(pool)} disabled={busy || !addToken}
                            className="rounded-[8px] bg-[#25c0f4] px-3 py-2 text-[12px] font-extrabold text-[#09111d] transition-all disabled:cursor-not-allowed disabled:opacity-50">
                            {busy ? 'Adding...' : `Add ${pool.token.symbol}`}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
                        <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 py-2">
                          {[0.25, 0.5, 1].map((f) => (
                            <button key={f} type="button" onClick={() => presetRemove(f)}
                              className="rounded-[6px] border border-white/[0.08] bg-[#1a2435] px-3 py-1 text-[11px] font-bold text-slate-300">
                              {f === 1 ? 'Max' : `${f * 100}%`}
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-2 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_140px_100px_130px] xl:items-end">
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">LP amount · current {lpBalance.toFixed(4)}</p>
                            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2">
                              <input type="number" value={removeLp} onChange={(e) => setRemoveLp(e.target.value)} placeholder="0.0"
                                className="w-full bg-transparent text-[14px] font-extrabold text-slate-100 outline-none placeholder:text-slate-700" />
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">Current share</p>
                            <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">{sharePct.toFixed(2)}%</div>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">You receive</p>
                            <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[11px] font-bold text-slate-100">{recvSummary}</div>
                          </div>
                          <button type="button" onClick={() => handleRemove(pool)} disabled={busy || pool.userLp <= 0n || !removeLp}
                            className="rounded-[8px] border border-red-400/20 bg-[rgba(127,29,29,0.18)] px-3 py-2 text-[12px] font-extrabold text-red-300 transition-all disabled:cursor-not-allowed disabled:opacity-50">
                            {busy ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
