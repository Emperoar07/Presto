'use client';

import { useCallback, useEffect, useState } from 'react';
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

// Fork pools surfaced in the liquidity UI. cirBTC is the one token with no
// Hub-AMM pool (it can't be priced 1:1), so its local market lives in the fork.
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
  const [tokenAmount, setTokenAmount] = useState('');
  const [removePct, setRemovePct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPools = useCallback(async () => {
    if (!publicClient || !fork || !hub) {
      setPools([]);
      return;
    }
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
      setPools(results.filter((p): p is ForkPool => p !== null));
    } catch (e) {
      console.error('Failed to load fork pools', e);
    }
  }, [publicClient, fork, hub, chainId, address]);

  useEffect(() => { loadPools(); }, [loadPools, refreshKey]);

  if (!fork || !hub || pools.length === 0) return null;

  const handleAdd = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    const amt = Number.parseFloat(tokenAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (pool.reserveToken <= 0n || pool.reserveHub <= 0n) return toast.error('Pool has no liquidity');
    const tokenDesired = parseUnits(tokenAmount, pool.token.decimals);
    const hubDesired = (tokenDesired * pool.reserveHub) / pool.reserveToken;
    if (hubDesired <= 0n) return toast.error('Amount too small');
    if (tokenDesired > pool.userTokenBal) return toast.error(`Insufficient ${pool.token.symbol}`);
    if (hubDesired > pool.userHubBal) return toast.error(`Need ${formatUnits(hubDesired, pool.hub.decimals)} ${pool.hub.symbol}`);
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
      setTokenAmount('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to add liquidity');
    } finally { setBusy(false); }
  };

  const handleRemove = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    if (pool.userLp <= 0n) return toast.error('No LP position');
    const liquidity = (pool.userLp * BigInt(removePct)) / 100n;
    if (liquidity <= 0n) return toast.error('Amount too small');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    setBusy(true);
    try {
      await approveToken(walletClient, publicClient, address, pool.pair, fork.router, liquidity);
      const hash = await walletClient.writeContract({
        address: fork.router, abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI, functionName: 'removeLiquidity',
        args: [pool.token.address, pool.hub.address, liquidity, 0n, 0n, address, deadline],
        account: address, chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Liquidity removed" />);
      await publicClient.waitForTransactionReceipt({ hash });
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
        const tvl = Number(formatUnits(pool.reserveHub, pool.hub.decimals)) * 2;
        const tokenReserveDisplay = Number(formatUnits(pool.reserveToken, pool.token.decimals));
        return (
          <div
            key={pool.pair}
            className="border-b border-white/[0.04] last:border-b-0"
            style={{ background: isOpen ? 'rgba(37,192,244,0.04)' : 'transparent' }}
          >
            <button
              type="button"
              onClick={() => { setOpenPair(isOpen ? null : pool.pair); setMode('add'); setTokenAmount(''); }}
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
                  {isOpen ? 'Hide' : pool.userLp > 0n ? 'Manage' : 'Add Liquidity'}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 md:px-5">
                <div className="rounded-[12px] border border-white/[0.06] bg-[#263347] p-3">
                  <div className="mb-3 flex w-fit gap-1 rounded-[10px] p-1" style={{ background: SURF }}>
                    {(['add', 'remove'] as const).map((m) => (
                      <button key={m} onClick={() => setMode(m)}
                        className={`rounded-lg px-3 py-1 text-[12px] font-semibold capitalize transition-all ${mode === m ? 'bg-[#263347] text-slate-100' : 'text-slate-500'}`}>
                        {m}
                      </button>
                    ))}
                  </div>

                  {mode === 'add' ? (
                    <div className="space-y-2">
                      <input value={tokenAmount}
                        onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setTokenAmount(e.target.value)}
                        placeholder={`Amount of ${pool.token.symbol}`}
                        className="w-full rounded-[10px] border border-white/[0.07] bg-[#1e293b] px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-primary/40" />
                      {tokenAmount && Number(tokenAmount) > 0 && pool.reserveToken > 0n && (
                        <p className="text-[11px] text-slate-500">
                          + {Number(formatUnits((parseUnits(tokenAmount || '0', pool.token.decimals) * pool.reserveHub) / pool.reserveToken, pool.hub.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.hub.symbol} at pool ratio
                        </p>
                      )}
                      <button type="button" disabled={busy || !tokenAmount} onClick={() => handleAdd(pool)}
                        className="w-full rounded-[10px] bg-[#25c0f4] py-2 text-[13px] font-bold text-[#0f172a] transition-opacity disabled:opacity-40">
                        {busy ? 'Adding...' : `Add ${pool.token.symbol} / ${pool.hub.symbol}`}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {[25, 50, 75, 100].map((p) => (
                          <button key={p} onClick={() => setRemovePct(p)}
                            className={`flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all ${removePct === p ? 'bg-primary/20 text-primary' : 'bg-white/[0.03] text-slate-400'}`}>
                            {p}%
                          </button>
                        ))}
                      </div>
                      <button type="button" disabled={busy || pool.userLp <= 0n} onClick={() => handleRemove(pool)}
                        className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] py-2 text-[13px] font-bold text-slate-100 transition-opacity disabled:opacity-40">
                        {busy ? 'Removing...' : pool.userLp > 0n ? `Remove ${removePct}%` : 'No LP position'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
