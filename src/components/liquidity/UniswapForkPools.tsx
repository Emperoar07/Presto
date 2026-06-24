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
const BDR = '1px solid rgba(255,255,255,0.07)';
const SLIPPAGE_BPS = 100n; // 1%

type ForkPool = {
  token: Token;
  hub: Token;
  pair: Address;
  reserveToken: bigint; // raw, token decimals
  reserveHub: bigint; // raw, hub (USDC) decimals
  totalSupply: bigint; // LP, 18dp
  userLp: bigint; // LP, 18dp
  userTokenBal: bigint;
  userHubBal: bigint;
};

export function UniswapForkPools() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const fork = getUniswapV2Addresses(chainId);
  const hub = getHubToken(chainId);

  const [pools, setPools] = useState<ForkPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [tokenAmount, setTokenAmount] = useState('');
  const [removePct, setRemovePct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPools = useCallback(async () => {
    if (!publicClient || !fork || !hub) {
      setPools([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const candidates = getTokens(chainId).filter((t) => !isHubToken(t, chainId));
      const results = await Promise.all(
        candidates.map(async (token): Promise<ForkPool | null> => {
          const pair = (await publicClient.readContract({
            address: fork.factory,
            abi: UNISWAP_V2_FACTORY_ABI,
            functionName: 'getPair',
            args: [token.address, hub.address],
          })) as Address;
          if (!pair || pair.toLowerCase() === ZERO) return null;

          const [reserves, token0, totalSupply, userLp] = await Promise.all([
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'getReserves' }) as Promise<readonly [bigint, bigint, number]>,
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'token0' }) as Promise<Address>,
            publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
            address
              ? (publicClient.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>)
              : Promise.resolve(0n),
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
    } finally {
      setLoading(false);
    }
  }, [publicClient, fork, hub, chainId, address]);

  useEffect(() => {
    loadPools();
  }, [loadPools, refreshKey]);

  if (!fork || !hub) {
    return <div className="px-5 py-8 text-center text-[13px] text-slate-500">No Uniswap V2 pools on this network.</div>;
  }

  const handleAdd = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    const amt = Number.parseFloat(tokenAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (pool.reserveToken <= 0n || pool.reserveHub <= 0n) return toast.error('Pool has no liquidity');

    const tokenDesired = parseUnits(tokenAmount, pool.token.decimals);
    // Match the current pool ratio (raw math preserves decimals).
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
        address: fork.router,
        abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        args: [pool.token.address, pool.hub.address, tokenDesired, hubDesired, tokenMin, hubMin, address, deadline],
        account: address,
        chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setTokenAmount('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to add liquidity');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address) return;
    if (pool.userLp <= 0n) return toast.error('No LP position');
    const liquidity = (pool.userLp * BigInt(removePct)) / 100n;
    if (liquidity <= 0n) return toast.error('Amount too small');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    setBusy(true);
    try {
      // LP token is the pair itself; approve it to the router, then remove.
      await approveToken(walletClient, publicClient, address, pool.pair, fork.router, liquidity);
      const hash = await walletClient.writeContract({
        address: fork.router,
        abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
        functionName: 'removeLiquidity',
        args: [pool.token.address, pool.hub.address, liquidity, 0n, 0n, address, deadline],
        account: address,
        chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Liquidity removed" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to remove liquidity');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
      <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
        <div>
          <p className="text-[14px] font-bold text-slate-100">Uniswap V2 Pools</p>
          <p className="text-[11px] text-slate-500">Community-providable pools that route alongside SynRoute</p>
        </div>
      </div>

      {loading && pools.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-slate-500">Loading pools...</div>
      ) : pools.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-slate-500">No Uniswap V2 pools seeded yet.</div>
      ) : (
        <div>
          {pools.map((pool) => {
            const isOpen = selected === pool.pair;
            const sharePct = pool.totalSupply > 0n ? (Number(pool.userLp) / Number(pool.totalSupply)) * 100 : 0;
            return (
              <div key={pool.pair} style={{ borderBottom: BDR }}>
                <button
                  type="button"
                  onClick={() => { setSelected(isOpen ? null : pool.pair); setMode('add'); setTokenAmount(''); }}
                  className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-slate-100">{pool.token.symbol} / {pool.hub.symbol}</p>
                    <p className="text-[11px] text-slate-500">
                      {Number(formatUnits(pool.reserveToken, pool.token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {pool.token.symbol}
                      {' · '}
                      {Number(formatUnits(pool.reserveHub, pool.hub.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pool.hub.symbol}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Your share</p>
                    <p className="text-[13px] font-semibold text-primary">{sharePct > 0 ? `${sharePct.toFixed(2)}%` : '—'}</p>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-3 px-5 pb-4">
                    <div className="flex w-fit gap-1 rounded-[10px] p-1" style={{ background: '#263347' }}>
                      {(['add', 'remove'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setMode(m)}
                          className={`rounded-lg px-3 py-1 text-[12px] font-semibold capitalize transition-all ${mode === m ? 'text-slate-100' : 'text-slate-500'}`}
                          style={mode === m ? { background: SURF } : {}}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    {mode === 'add' ? (
                      <div className="space-y-2">
                        <input
                          value={tokenAmount}
                          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setTokenAmount(e.target.value)}
                          placeholder={`Amount of ${pool.token.symbol}`}
                          className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-primary/40"
                        />
                        {tokenAmount && Number(tokenAmount) > 0 && pool.reserveToken > 0n && (
                          <p className="text-[11px] text-slate-500">
                            + {Number(formatUnits((parseUnits(tokenAmount || '0', pool.token.decimals) * pool.reserveHub) / pool.reserveToken, pool.hub.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.hub.symbol} (at pool ratio)
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={busy || !tokenAmount}
                          onClick={() => handleAdd(pool)}
                          className="w-full rounded-[10px] bg-primary py-2 text-[13px] font-bold text-[#0f172a] transition-opacity disabled:opacity-40"
                        >
                          {busy ? 'Adding...' : `Add ${pool.token.symbol} / ${pool.hub.symbol}`}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {[25, 50, 75, 100].map((p) => (
                            <button
                              key={p}
                              onClick={() => setRemovePct(p)}
                              className={`flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all ${removePct === p ? 'bg-primary/20 text-primary' : 'bg-white/[0.03] text-slate-400'}`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={busy || pool.userLp <= 0n}
                          onClick={() => handleRemove(pool)}
                          className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] py-2 text-[13px] font-bold text-slate-100 transition-opacity disabled:opacity-40"
                        >
                          {busy ? 'Removing...' : pool.userLp > 0n ? `Remove ${removePct}%` : 'No LP position'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
