'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseSignature, parseUnits, type Abi, type Address, type PublicClient } from 'viem';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { getHubToken, getTokens, isHubToken, type Token } from '@/config/tokens';
import { approveCall, contractCall, sendAtomicBatch, walletSupportsAtomicBatch } from '@/lib/batchCalls';
import {
  CIRBTC_LIQUIDITY_REWARDS_ABI,
  CIRBTC_REWARDS_ADDRESS,
  getUniswapV2Addresses,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V2_ROUTER_LIQUIDITY_ABI,
} from '@/config/contracts';
import { approveToken, getTokenBalance } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';
import { useForkPoolStats } from '@/hooks/useApiQueries';
import { selectPoolStatsByToken } from '@/lib/forkPoolStats';

const ZERO = '0x0000000000000000000000000000000000000000';
const SURF = '#1e293b';
const USDC_COLOR = '#3b82f6';
const USDC_LABEL = 'US';
const SLIPPAGE_BPS = 100n; // 1%

// cirBTC is the one token with no Hub-AMM pool (it can't be priced 1:1), so its
// local market lives in the Uniswap fork and is surfaced here.
const FORK_LIQUIDITY_SYMBOLS = new Set(['cirbtc']);

// Superseded cirBTC rewards deployments. They still custody users' staked LP
// after a rewards-contract migration, so we read positions/claimables from them
// too — otherwise a migrated stake silently disappears from "My Positions".
const PRIOR_CIRBTC_REWARDS: Address[] = ['0x735C744F459f9E19E5061dA46FAe417b87Cb22B2'];

type ForkPool = {
  token: Token;
  hub: Token;
  pair: Address;
  reserveToken: bigint;
  reserveHub: bigint;
  totalSupply: bigint;
  userLp: bigint;
  stakedLp: bigint;
  principalUsdc: bigint;
  claimableUsyc: bigint;
  userTokenBal: bigint;
  userHubBal: bigint;
  // Rewards contract that actually custodies this user's stake/claimable —
  // usually the current one, but a prior deployment for migrated positions.
  rewardsContract: Address;
};

const fmtUsd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`);
const trimNum = (n: number, max = 6) => Number(n.toFixed(max)).toString();

export function UniswapForkPools({ variant = 'all' }: { variant?: 'all' | 'positions' } = {}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: sharedForkStats } = useForkPoolStats();

  const fork = getUniswapV2Addresses(chainId);
  const hub = getHubToken(chainId);
  const rewardsConfigured = chainId === 5042002 && CIRBTC_REWARDS_ADDRESS.toLowerCase() !== ZERO;

  // Known synchronously, so rows can render instantly while reserves hydrate.
  const candidates = useMemo(
    () => (fork && hub ? getTokens(chainId).filter((t) => !isHubToken(t, chainId) && FORK_LIQUIDITY_SYMBOLS.has(t.symbol.toLowerCase())) : []),
    [fork, hub, chainId]
  );

  const [pools, setPools] = useState<ForkPool[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openPair, setOpenPair] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [removeSource, setRemoveSource] = useState<'rewards' | 'wallet'>('rewards');
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

          // Resolve which rewards contract holds this user's stake: prefer the
          // current (fixed) one, then fall back to superseded deployments so a
          // pre-migration stake still shows up as a position.
          const readRewards = (rewardsAddr: Address) =>
            Promise.all([
              publicClient.readContract({ address: rewardsAddr, abi: CIRBTC_LIQUIDITY_REWARDS_ABI, functionName: 'stakedLp', args: [address!] }) as Promise<bigint>,
              publicClient.readContract({ address: rewardsAddr, abi: CIRBTC_LIQUIDITY_REWARDS_ABI, functionName: 'principalUsdc', args: [address!] }) as Promise<bigint>,
              publicClient.readContract({ address: rewardsAddr, abi: CIRBTC_LIQUIDITY_REWARDS_ABI, functionName: 'claimableOf', args: [address!] }) as Promise<bigint>,
            ]).catch(() => [0n, 0n, 0n] as [bigint, bigint, bigint]);

          let rewardsContract = CIRBTC_REWARDS_ADDRESS as Address;
          let stakedLp = 0n;
          let principalUsdc = 0n;
          let claimableUsyc = 0n;
          if (address && rewardsConfigured) {
            [stakedLp, principalUsdc, claimableUsyc] = await readRewards(CIRBTC_REWARDS_ADDRESS as Address);
            if (stakedLp === 0n && claimableUsyc === 0n) {
              for (const prior of PRIOR_CIRBTC_REWARDS) {
                const [s, p, c] = await readRewards(prior);
                if (s > 0n || c > 0n) {
                  rewardsContract = prior;
                  stakedLp = s;
                  principalUsdc = p;
                  claimableUsyc = c;
                  break;
                }
              }
            }
          }
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
          return { token, hub, pair, reserveToken, reserveHub, totalSupply, userLp, stakedLp, principalUsdc, claimableUsyc, userTokenBal, userHubBal, rewardsContract };
        })
      );
      if (id !== reqId.current) return; // a newer load superseded this one
      setPools(results.filter((p): p is ForkPool => p !== null));
      setLoaded(true);
    } catch (e) {
      // Keep the last good rows on transient RPC errors (e.g. rate limits).
      console.error('Failed to load fork pools', e);
    }
  }, [publicClient, fork, hub, chainId, address, rewardsConfigured]);

  useEffect(() => {
    loadPools();
    const interval = rewardsConfigured ? window.setInterval(loadPools, 30_000) : undefined;
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [loadPools, refreshKey, rewardsConfigured]);

  if (!fork || !hub) return null;

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

  const handleActivateRewards = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address || !rewardsConfigured || pool.userLp <= 0n) return;
    setBusy(true);
    try {
      const nonce = await publicClient.readContract({
        address: pool.pair,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: 'nonces',
        args: [address],
      }) as bigint;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const signature = await walletClient.signTypedData({
        account: address,
        domain: {
          name: 'Tempo LPs',
          version: '1',
          chainId,
          verifyingContract: pool.pair,
        },
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: address,
          spender: CIRBTC_REWARDS_ADDRESS,
          value: pool.userLp,
          nonce,
          deadline,
        },
      });
      const parsed = parseSignature(signature);
      const v = parsed.v ?? BigInt(27 + (parsed.yParity ?? 0));
      const hash = await walletClient.writeContract({
        address: CIRBTC_REWARDS_ADDRESS,
        abi: CIRBTC_LIQUIDITY_REWARDS_ABI,
        functionName: 'activateWithPermit',
        args: [pool.userLp, deadline, Number(v), parsed.r, parsed.s],
        account: address,
        chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="Rewards activated" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (!isUserCancellation(error)) toast.error(error instanceof Error ? error.message.slice(0, 100) : 'Failed to activate rewards');
    } finally {
      setBusy(false);
    }
  };

  const handleClaimRewards = async (pool: ForkPool) => {
    if (!walletClient || !publicClient || !address || !rewardsConfigured || pool.claimableUsyc <= 0n) return;
    setBusy(true);
    try {
      const hash = await walletClient.writeContract({
        address: pool.rewardsContract,
        abi: CIRBTC_LIQUIDITY_REWARDS_ABI,
        functionName: 'claim',
        account: address,
        chain: null,
      });
      toast.custom(() => <TxToast hash={hash} title="USYC claimed" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (!isUserCancellation(error)) toast.error(error instanceof Error ? error.message.slice(0, 100) : 'Failed to claim USYC');
    } finally {
      setBusy(false);
    }
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
      let hash: `0x${string}`;
      if (rewardsConfigured) {
        const rewardArgs = [tokenDesired, hubDesired, tokenMin, hubMin, deadline] as const;
        if (await walletSupportsAtomicBatch(walletClient, address, chainId)) {
          hash = await sendAtomicBatch(walletClient, address, [
            approveCall(pool.token.address, CIRBTC_REWARDS_ADDRESS, tokenDesired),
            approveCall(pool.hub.address, CIRBTC_REWARDS_ADDRESS, hubDesired),
            contractCall(CIRBTC_REWARDS_ADDRESS, CIRBTC_LIQUIDITY_REWARDS_ABI as Abi, 'addLiquidity', rewardArgs),
          ]);
        } else {
          await approveToken(walletClient, publicClient, address, pool.token.address, CIRBTC_REWARDS_ADDRESS, tokenDesired);
          await approveToken(walletClient, publicClient, address, pool.hub.address, CIRBTC_REWARDS_ADDRESS, hubDesired);
          hash = await walletClient.writeContract({
            address: CIRBTC_REWARDS_ADDRESS,
            abi: CIRBTC_LIQUIDITY_REWARDS_ABI,
            functionName: 'addLiquidity',
            args: rewardArgs,
            account: address,
            chain: null,
          });
        }
      } else {
        const addArgs = [pool.token.address, pool.hub.address, tokenDesired, hubDesired, tokenMin, hubMin, address, deadline] as const;
        if (await walletSupportsAtomicBatch(walletClient, address, chainId)) {
          hash = await sendAtomicBatch(walletClient, address, [
            approveCall(pool.token.address, fork.router, tokenDesired),
            approveCall(pool.hub.address, fork.router, hubDesired),
            contractCall(fork.router, UNISWAP_V2_ROUTER_LIQUIDITY_ABI as Abi, 'addLiquidity', addArgs),
          ]);
        } else {
          await approveToken(walletClient, publicClient, address, pool.token.address, fork.router, tokenDesired);
          await approveToken(walletClient, publicClient, address, pool.hub.address, fork.router, hubDesired);
          hash = await walletClient.writeContract({
            address: fork.router, abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI, functionName: 'addLiquidity',
            args: addArgs, account: address, chain: null,
          });
        }
      }
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
    const useRewardLp = removeSource === 'rewards' && pool.stakedLp > 0n;
    const availableLp = useRewardLp ? pool.stakedLp : pool.userLp;
    if (liquidity > availableLp) liquidity = availableLp;
    if (liquidity <= 0n) return toast.error('No LP position');
    if (pool.totalSupply <= 0n) return toast.error('Pool has no liquidity');
    const expectedTokenOut = (pool.reserveToken * liquidity) / pool.totalSupply;
    const expectedHubOut = (pool.reserveHub * liquidity) / pool.totalSupply;
    const tokenMin = expectedTokenOut - (expectedTokenOut * SLIPPAGE_BPS) / 10000n;
    const hubMin = expectedHubOut - (expectedHubOut * SLIPPAGE_BPS) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    setBusy(true);
    try {
      let hash: `0x${string}`;
      if (rewardsConfigured && useRewardLp) {
        hash = await walletClient.writeContract({
          address: pool.rewardsContract,
          abi: CIRBTC_LIQUIDITY_REWARDS_ABI,
          functionName: 'removeLiquidity',
          args: [liquidity, tokenMin, hubMin, deadline],
          account: address,
          chain: null,
        });
      } else {
        await approveToken(walletClient, publicClient, address, pool.pair, fork.router, liquidity);
        hash = await walletClient.writeContract({
          address: fork.router, abi: UNISWAP_V2_ROUTER_LIQUIDITY_ABI, functionName: 'removeLiquidity',
          args: [pool.token.address, pool.hub.address, liquidity, tokenMin, hubMin, address, deadline],
          account: address, chain: null,
        });
      }
      toast.custom(() => <TxToast hash={hash} title="Liquidity removed" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setRemoveLp('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if (!isUserCancellation(e)) toast.error(e instanceof Error ? e.message.slice(0, 100) : 'Failed to remove liquidity');
    } finally { setBusy(false); }
  };

  const computeDerived = (pool: ForkPool) => {
    const totalUserLp = pool.userLp + pool.stakedLp;
    const sharePct = pool.totalSupply > 0n ? (Number(totalUserLp) / Number(pool.totalSupply)) * 100 : 0;
    const reserveTokenDisp = Number(formatUnits(pool.reserveToken, pool.token.decimals));
    const reserveHubDisp = Number(formatUnits(pool.reserveHub, pool.hub.decimals));
    const tvl = reserveHubDisp * 2;
    const lpBalance = Number(formatUnits(totalUserLp, 18));
    const posValue = (tvl * sharePct) / 100;
    const rate = reserveTokenDisp > 0 ? reserveHubDisp / reserveTokenDisp : 0;
    return { sharePct, reserveTokenDisp, reserveHubDisp, tvl, lpBalance, posValue, rate };
  };

  const volumeDisplay = (pool: ForkPool) =>
    selectPoolStatsByToken(sharedForkStats?.pool ? [sharedForkStats.pool] : [], pool.token.address)?.vol24h ?? '--';

  // Shared add/remove manager body used by both the All Pools row and the My Positions card.
  const renderManager = (pool: ForkPool) => {
    const { sharePct, reserveTokenDisp, reserveHubDisp, tvl, lpBalance, posValue, rate } = computeDerived(pool);
    const useRewardLp = removeSource === 'rewards' && pool.stakedLp > 0n;
    const removableLp = Number(formatUnits(useRewardLp ? pool.stakedLp : pool.userLp, 18));

    let estLp = '--';
    if (addToken && Number(addToken) > 0 && pool.reserveToken > 0n && pool.totalSupply > 0n) {
      const minted = (parseUnits(addToken, pool.token.decimals) * pool.totalSupply) / pool.reserveToken;
      estLp = Number(formatUnits(minted, 18)).toFixed(4);
    }
    let recvSummary = '--';
    if (removeLp && Number(removeLp) > 0 && pool.totalSupply > 0n) {
      const liq = parseUnits(removeLp, 18);
      const tOut = (liq * pool.reserveToken) / pool.totalSupply;
      const hOut = (liq * pool.reserveHub) / pool.totalSupply;
      recvSummary = `${trimNum(Number(formatUnits(tOut, pool.token.decimals)))} ${pool.token.symbol} · ${trimNum(Number(formatUnits(hOut, pool.hub.decimals)), 2)} ${pool.hub.symbol}`;
    }
    const presetRemove = (f: number) => setRemoveLp(trimNum(removableLp * f, 8));

    const statItems = [
      { label: 'Value', value: fmtUsd(posValue) },
      { label: 'Liquidity', value: fmtUsd(tvl) },
      { label: '24h Vol', value: volumeDisplay(pool) },
      { label: 'Reserves', value: `${trimNum(reserveTokenDisp)} ${pool.token.symbol} · ${trimNum(reserveHubDisp, 2)} ${pool.hub.symbol}` },
      { label: 'Rate', value: rate > 0 ? `1 ${pool.token.symbol} ≈ ${rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${pool.hub.symbol}` : '--' },
    ];

    return (
      <div className="mt-2 overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#182336]">
        <div className="flex flex-col gap-2 px-3 py-2.5">
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
                <p className="text-[10px] text-slate-500">Uniswap V2 · 0.3% swap fee · 1% USYC APR</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full bg-[#153b37] px-2 py-0.5 text-[10px] font-bold text-emerald-400">LP {lpBalance.toFixed(4)}</span>
              {pool.stakedLp > 0n && (
                <span className="inline-flex rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  {Number(formatUnits(pool.stakedLp, 18)).toFixed(4)} earning
                </span>
              )}
              <span className="inline-flex rounded-full bg-[#16384b] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]">{sharePct.toFixed(2)}%</span>
              {rewardsConfigured && pool.userLp > 0n && (
                <button
                  type="button"
                  onClick={() => handleActivateRewards(pool)}
                  disabled={busy}
                  className="rounded-[6px] bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold text-[#071a14] disabled:opacity-50"
                >
                  Activate 1% Rewards
                </button>
              )}
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
                {pool.stakedLp > 0n && pool.userLp > 0n && (
                  <div className="mr-2 flex rounded-[7px] border border-white/[0.08] bg-[#11192a] p-0.5">
                    {(['rewards', 'wallet'] as const).map((source) => (
                      <button
                        key={source}
                        type="button"
                        onClick={() => { setRemoveSource(source); setRemoveLp(''); }}
                        className="rounded-[5px] px-2.5 py-1 text-[10px] font-bold"
                        style={removeSource === source ? { background: '#263347', color: '#f1f5f9' } : { color: '#64748b' }}
                      >
                        {source === 'rewards' ? 'Rewards LP' : 'Wallet LP'}
                      </button>
                    ))}
                  </div>
                )}
                {[0.25, 0.5, 1].map((f) => (
                  <button key={f} type="button" onClick={() => presetRemove(f)}
                    className="rounded-[6px] border border-white/[0.08] bg-[#1a2435] px-3 py-1 text-[11px] font-bold text-slate-300">
                    {f === 1 ? 'Max' : `${f * 100}%`}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_140px_100px_130px] xl:items-end">
                <div>
                  <p className="mb-1 text-[10px] text-slate-500">{useRewardLp ? 'Rewards LP' : 'Wallet LP'} amount · available {removableLp.toFixed(4)}</p>
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
                <button type="button" onClick={() => handleRemove(pool)} disabled={busy || removableLp <= 0 || !removeLp}
                  className="rounded-[8px] border border-red-400/20 bg-[rgba(127,29,29,0.18)] px-3 py-2 text-[12px] font-extrabold text-red-300 transition-all disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Compact row used in the All Pools list.
  const renderPool = (pool: ForkPool) => {
    const isOpen = openPair === pool.pair;
    const { tvl, lpBalance } = computeDerived(pool);
    const volume = volumeDisplay(pool);
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
            <p className="mt-0.5 text-[11px] text-slate-500">Uniswap V2 · 0.3% swap fee · 1% USYC APR</p>
          </div>
          <div className="hidden md:block">
            <p className="text-[13px] font-semibold text-slate-100">{fmtUsd(tvl)}</p>
            <p className="text-[11px] text-slate-500">Liquidity</p>
          </div>
          <div className="hidden md:block">
            <p className="text-[13px] font-semibold text-slate-100">{volume}</p>
            <p className="text-[11px] text-slate-500">24h Vol</p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="hidden rounded-[10px] bg-[#25c0f4] px-3 py-2 text-[12px] font-bold text-[#0f172a] md:inline-block">
              {isOpen ? 'Hide Manager' : lpBalance > 0 ? 'Manage' : 'Add Liquidity'}
            </span>
          </div>
        </button>

        {isOpen && <div className="px-4 pb-4 md:px-5">{renderManager(pool)}</div>}
      </div>
    );
  };

  // Rich card used in My Positions, including the fork reward position.
  const renderPositionCard = (pool: ForkPool) => {
    const isOpen = openPair === pool.pair;
    const { sharePct, tvl, lpBalance, posValue } = computeDerived(pool);
    const volume = volumeDisplay(pool);
    const claimableUsyc = Number(formatUnits(pool.claimableUsyc, 6));
    const activatedLp = Number(formatUnits(pool.stakedLp, 18));
    const aprPercent = 1.0;
    const dailyRewardUsyc = posValue > 0 ? (posValue * (aprPercent / 100)) / 365 : 0;
    return (
      <div
        key={pool.pair}
        className="rounded-[16px] px-5 py-4"
        style={{ background: isOpen ? '#263347' : SURF, border: isOpen ? '1px solid rgba(37,192,244,0.22)' : '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="relative flex h-8 w-12 flex-shrink-0">
                {[{ bg: '#f7931a', lbl: 'cB' }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                  <div key={idx} className="absolute flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: ic.bg, left: idx === 0 ? 0 : 18, zIndex: idx === 0 ? 1 : 0, border: `2px solid ${isOpen ? '#263347' : SURF}` }}>
                    {ic.lbl}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[16px] font-bold text-slate-100">{pool.token.symbol} / {pool.hub.symbol}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">Stable liquidity position</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 text-left sm:grid-cols-3 sm:text-right">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">LP Balance</p>
              <p className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-100">{lpBalance.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Pool Share</p>
              <p className="mt-1 text-[18px] font-extrabold tracking-tight text-[#25c0f4]">{sharePct.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Est. Value</p>
              <p className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-100">${posValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>{volume} 24h volume</span>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>1.0% APR</span>
            {activatedLp > 0 && (
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-emerald-400" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
                {activatedLp.toFixed(4)} LP activated
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rewardsConfigured && (
              <>
                <div className="flex items-center h-9 rounded-[10px] px-3 text-[11px]" style={{ background: 'rgba(0,184,122,0.08)', border: '1px solid rgba(0,184,122,0.18)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#00b87a]">
                      {claimableUsyc > 0 ? `${claimableUsyc.toFixed(4)} USYC` : '0.0000 USYC'}
                    </span>
                    <span className="text-slate-500">claimable</span>
                  </div>
                  {dailyRewardUsyc > 0 && (
                    <span className="ml-2 pl-2 border-l border-white/[0.08] text-[9.5px] text-slate-500">
                      ~{dailyRewardUsyc.toFixed(4)} / day
                    </span>
                  )}
                </div>
                {pool.userLp > 0n && (
                  <button
                    type="button"
                    onClick={() => handleActivateRewards(pool)}
                    disabled={busy}
                    className="h-9 rounded-[10px] bg-emerald-500 px-3 text-[11px] font-extrabold text-[#071a14] disabled:opacity-50"
                  >
                    Activate Rewards
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleClaimRewards(pool)}
                  disabled={busy || pool.claimableUsyc <= 0n}
                  className="h-9 rounded-[10px] px-4 text-[12px] font-bold text-[#071a14] transition-all disabled:opacity-40"
                  style={{ background: '#00b87a' }}
                >
                  Claim USYC
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setOpenPair(isOpen ? null : pool.pair); setMode('add'); setAddToken(''); setAddHub(''); setRemoveLp(''); }}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors"
              style={{ background: '#25c0f4', color: '#0f172a' }}
              title={isOpen ? 'Hide Manager' : 'Manage Position'}
            >
              <span className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
          </div>
        </div>

        {isOpen ? renderManager(pool) : null}
      </div>
    );
  };

  const renderSkeleton = (token: Token) => (
    <div key={token.address} className="border-b border-white/[0.04] last:border-b-0">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3.5 md:grid md:gap-3.5 md:px-5" style={{ gridTemplateColumns: 'auto 1fr 140px 140px 124px' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex h-6 w-10 flex-shrink-0">
            {[{ bg: '#f7931a', lbl: 'cB' }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
              <div key={idx} className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                style={{ background: ic.bg, left: idx === 0 ? 0 : 14, zIndex: idx === 0 ? 1 : 0, border: `2px solid ${SURF}` }}>{ic.lbl}</div>
            ))}
          </div>
          <div className="min-w-0 md:hidden">
            <p className="text-[13px] font-bold text-slate-100">{token.symbol} / {hub.symbol}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Loading…</p>
          </div>
        </div>
        <div className="hidden md:block">
          <p className="text-[13px] font-bold text-slate-100">{token.symbol} / {hub.symbol}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Uniswap V2 · 0.3% swap fee · 1% USYC APR</p>
        </div>
        <div className="hidden md:block"><p className="text-[13px] font-semibold text-slate-500">—</p><p className="text-[11px] text-slate-500">Liquidity</p></div>
        <div className="hidden md:block"><p className="text-[13px] font-semibold text-slate-500">—</p><p className="text-[11px] text-slate-500">24h Vol</p></div>
        <div className="flex items-center justify-end gap-3"><span className="hidden rounded-[10px] bg-white/[0.06] px-3 py-2 text-[12px] font-bold text-slate-500 md:inline-block">Loading…</span></div>
      </div>
    </div>
  );

  // My Positions only shows pools where the user actually has LP — as a rich card.
  if (variant === 'positions') {
    const pos = pools.filter((p) => p.userLp + p.stakedLp > 0n || p.claimableUsyc > 0n);
    if (pos.length === 0) return null;
    return <>{pos.map(renderPositionCard)}</>;
  }

  // All Pools: render rows instantly (skeleton) until reserves hydrate.
  if (!loaded) {
    if (candidates.length === 0) return null;
    return <>{candidates.map(renderSkeleton)}</>;
  }
  if (pools.length === 0) return null;
  return <>{pools.map(renderPool)}</>;
}
