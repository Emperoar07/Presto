'use client';

import { useState, useEffect, type ReactNode, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useChainId, useWalletClient, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';
import { Hooks } from '@/lib/tempo';
import { MonitorSwaps } from './MonitorSwaps';
import { RebalancePool } from './RebalancePool';
import { PoolStats } from './PoolStats';
import { addFeeLiquidity, getTokenBalance, quoteHubLiquidityPathAmount } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';
import { emitPrestoDataRefresh, refreshPrestoQueries } from '@/lib/appDataRefresh';
import type { PublicClient } from 'viem';
import { FACTORY_ABI, getContractAddresses, isArcChain, isTempoNativeChain, ZERO_ADDRESS } from '@/config/contracts';
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

function formatEditableAmount(value: number, decimals: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value
    .toFixed(Math.min(decimals, 6))
    .replace(/\.?0+$/, '');
}

interface ManageFeeLiquidityProps {
  userToken: string;
  validatorToken: string;
  userTokenDecimals?: number;
  validatorTokenDecimals?: number;
  userTokenSymbol?: string;
  validatorTokenSymbol?: string;
  showMaintenance?: boolean;
  removeAmount?: string;
  onRemoveAmountChange?: (value: string) => void;
  pairManagementPanel?: ReactNode;
  addActionRef?: RefObject<HTMLDivElement>;
  removeActionRef?: RefObject<HTMLDivElement>;
}

type BurnLiquidityArgs = {
  userTokenAddress: `0x${string}`;
  validatorTokenAddress: `0x${string}`;
  liquidityAmount: bigint;
  to: `0x${string}`;
  feeToken: `0x${string}`;
};

type BurnLiquidityAction = {
  mutate: (args: BurnLiquidityArgs) => void;
  mutateAsync?: (args: BurnLiquidityArgs) => Promise<`0x${string}`>;
  isPending: boolean;
};

export function ManageFeeLiquidity({
  userToken,
  validatorToken,
  userTokenDecimals = 18,
  validatorTokenDecimals = 18,
  userTokenSymbol = 'Token',
  validatorTokenSymbol = 'pathUSD',
  showMaintenance = true,
  removeAmount = '',
  onRemoveAmountChange,
  pairManagementPanel,
  addActionRef,
  removeActionRef,
}: ManageFeeLiquidityProps) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const chainId = useChainId();
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const factoryAddress = getContractAddresses(chainId).FACTORY_ADDRESS;
  const [amount, setAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState('0');
  const [validatorTokenBalance, setValidatorTokenBalance] = useState('0');
  const [requiredPathAmount, setRequiredPathAmount] = useState('0');
  const [feeTo, setFeeTo] = useState<string>('');
  const [feeToSetter, setFeeToSetter] = useState<string>('');
  const [feeToInput, setFeeToInput] = useState('');
  const [isSettingFeeTo, setIsSettingFeeTo] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      if (publicClient && address && validatorToken && userToken) {
        const [userBal, validatorBal] = await Promise.all([
          getTokenBalance(publicClient, address, userToken, userTokenDecimals),
          getTokenBalance(publicClient, address, validatorToken, validatorTokenDecimals),
        ]);
        setUserTokenBalance(userBal);
        setValidatorTokenBalance(validatorBal);
      }
    };
    fetchBalance();
  }, [publicClient, address, userToken, userTokenDecimals, validatorToken, validatorTokenDecimals, isAdding]);

  useEffect(() => {
    const fetchRequirement = async () => {
      if (!publicClient || !amount || Number(amount) <= 0 || !userToken || !validatorToken || isTempoChain) {
        setRequiredPathAmount('0');
        return;
      }

      try {
        const pathRequired = await quoteHubLiquidityPathAmount(
          publicClient as PublicClient,
          userToken,
          validatorToken,
          parseUnits(amount, userTokenDecimals),
          chainId
        );
        setRequiredPathAmount(formatUnits(pathRequired, validatorTokenDecimals));
      } catch (error) {
        console.error('Failed to quote Arc paired liquidity amount', error);
        setRequiredPathAmount('0');
      }
    };

    fetchRequirement();
  }, [amount, chainId, isTempoChain, publicClient, userToken, userTokenDecimals, validatorToken, validatorTokenDecimals]);

  useEffect(() => {
    const fetchFeeTo = async () => {
      if (!publicClient || !factoryAddress || factoryAddress === ZERO_ADDRESS) return;
      try {
        const [nextFeeTo, nextFeeToSetter] = await Promise.all([
          publicClient.readContract({
            address: factoryAddress,
            abi: FACTORY_ABI,
            functionName: 'feeTo',
          }),
          publicClient.readContract({
            address: factoryAddress,
            abi: FACTORY_ABI,
            functionName: 'feeToSetter',
          }),
        ]);
        setFeeTo(nextFeeTo as string);
        setFeeToSetter(nextFeeToSetter as string);
      } catch (e) {
        console.error('Failed to read factory feeTo', e);
      }
    };
    fetchFeeTo();
  }, [publicClient, factoryAddress]);

  const { data: pool } = (Hooks.amm.usePool
    ? Hooks.amm.usePool({
        userToken: userToken as `0x${string}`,
        validatorToken: validatorToken as `0x${string}`,
      })
    : { data: null }) as { data: { reserveUserToken: bigint; reserveValidatorToken: bigint } | null };

  const { data: balance } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address,
        userToken: userToken as `0x${string}`,
        validatorToken: validatorToken as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  const { data: totalShares } = (Hooks.amm.useTotalShares
    ? Hooks.amm.useTotalShares({
        userToken: userToken as `0x${string}`,
        validatorToken: validatorToken as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };
  const burnLiquidity: BurnLiquidityAction = Hooks.amm.useBurnSync ? Hooks.amm.useBurnSync() : { mutate: () => {}, isPending: false };
  const { snapshotAsync } = Hooks.amm.useSnapshotRewards
    ? Hooks.amm.useSnapshotRewards()
    : { snapshotAsync: null };
  const { data: rewardsEnabled } = (Hooks.amm.usePoolRewardsEnabled
    ? Hooks.amm.usePoolRewardsEnabled({ token: userToken as `0x${string}` })
    : { data: false }) as { data: boolean | null };

  const checkpointRewards = async () => {
    if (!address || !rewardsEnabled || !snapshotAsync) return;
    await snapshotAsync(address as `0x${string}`, userToken as `0x${string}`);
  };

  const estimatedTotalShares = isTempoChain
    ? (pool?.reserveValidatorToken ? pool.reserveValidatorToken * 2n : null)
    : (totalShares ?? null);

  const estimatedLpTokens = (() => {
    if (!amount || !pool?.reserveValidatorToken || pool.reserveValidatorToken === 0n || !estimatedTotalShares) {
      return null;
    }
    try {
      const inputValue = Number.parseFloat(amount);
      if (!Number.isFinite(inputValue) || inputValue <= 0) return null;

      const reserveBase = isTempoChain
        ? Number.parseFloat(validatorTokenBalance || '0')
        : Number(formatUnits(pool.reserveUserToken, userTokenDecimals));
      const reserveForMint = isTempoChain
        ? Number(formatUnits(pool.reserveValidatorToken, validatorTokenDecimals))
        : reserveBase;
      const currentTotalShares = Number(formatUnits(estimatedTotalShares, 18));

      if (!Number.isFinite(reserveForMint) || reserveForMint <= 0 || !Number.isFinite(currentTotalShares)) {
        return null;
      }

      const minted = (inputValue / reserveForMint) * currentTotalShares;
      return Number.isFinite(minted) ? minted : null;
    } catch {
      return null;
    }
  })();

  const estimatedPoolShare = (() => {
    if (estimatedLpTokens === null || !estimatedTotalShares) return null;
    const currentTotal = Number(formatUnits(estimatedTotalShares, 18));
    const currentUserShares = balance ? Number(formatUnits(balance, 18)) : 0;
    const newTotal = currentTotal + estimatedLpTokens;
    const newUserShares = currentUserShares + estimatedLpTokens;
    if (!Number.isFinite(newTotal) || newTotal <= 0) return null;
    const share = (newUserShares / newTotal) * 100;
    return Number.isFinite(share) ? share : null;
  })();
  const numericUserBalance = Number.parseFloat(userTokenBalance || '0');
  const numericValidatorBalance = Number.parseFloat(validatorTokenBalance || '0');
  const reserveUserValue = pool?.reserveUserToken ? Number(formatUnits(pool.reserveUserToken, userTokenDecimals)) : 0;
  const reserveValidatorValue = pool?.reserveValidatorToken ? Number(formatUnits(pool.reserveValidatorToken, validatorTokenDecimals)) : 0;
  const maxAddAmount = (() => {
    if (isTempoChain) return validatorTokenBalance;
    if (!Number.isFinite(numericUserBalance) || numericUserBalance <= 0) return '0';
    if (!Number.isFinite(numericValidatorBalance) || numericValidatorBalance <= 0) return '0';
    if (!Number.isFinite(reserveUserValue) || !Number.isFinite(reserveValidatorValue) || reserveUserValue <= 0 || reserveValidatorValue <= 0) {
      return formatEditableAmount(numericUserBalance, userTokenDecimals);
    }
    const affordableByHub = numericValidatorBalance * (reserveUserValue / reserveValidatorValue);
    return formatEditableAmount(Math.min(numericUserBalance, affordableByHub), userTokenDecimals);
  })();

  const handleAddLiquidity = async () => {
    if (!address || !amount || !walletClient || !publicClient) return;
    setIsAdding(true);
    setIsApproving(false);
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;
    try {
      const numericAmount = Number.parseFloat(amount);
      const availableInputBalance = isTempoChain ? numericValidatorBalance : numericUserBalance;
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        toast.error('Enter a valid amount');
        return;
      }
      if (!Number.isFinite(availableInputBalance) || numericAmount > availableInputBalance + 1e-8) {
        toast.error(`Insufficient ${isTempoChain ? validatorTokenSymbol : userTokenSymbol} balance`);
        return;
      }
      if (!isTempoChain) {
        const quotedHubAmount = Number.parseFloat(requiredPathAmount || '0');
        const fallbackHubAmount =
          reserveUserValue > 0 && reserveValidatorValue > 0
            ? numericAmount * (reserveValidatorValue / reserveUserValue)
            : 0;
        const effectiveHubNeeded = quotedHubAmount > 0 ? quotedHubAmount : fallbackHubAmount;
        if (!Number.isFinite(numericValidatorBalance) || effectiveHubNeeded > numericValidatorBalance + 1e-8) {
          toast.error(`Need ${effectiveHubNeeded.toFixed(4)} ${validatorTokenSymbol} but only ${numericValidatorBalance.toFixed(4)} is available`);
          return;
        }
      }

      await checkpointRewards();

      hash = await addFeeLiquidity(
        walletClient,
        publicClient as unknown as PublicClient,
        address as `0x${string}`,
        userToken as `0x${string}`,
        validatorToken as `0x${string}`,
        parseUnits(amount, isTempoChain ? validatorTokenDecimals : userTokenDecimals),
        (stage: 'approving' | 'adding') => {
          if (stage === 'approving') {
            setIsApproving(true);
          } else {
            setIsApproving(false);
          }
        },
        chainId
      );
      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `Add Liquidity ${userTokenSymbol}/${validatorTokenSymbol}`,
        subtitle: `${amount} ${isTempoChain ? validatorTokenSymbol : userTokenSymbol}`,
        status: 'pending',
        hash,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);
      toast.custom(() => <TxToast hash={hash!} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
      }
      await refreshPrestoQueries(queryClient, { address, chainId });
      emitPrestoDataRefresh('liquidity');
      setAmount('');
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Transaction failed';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage: msg,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `Add Liquidity ${userTokenSymbol}/${validatorTokenSymbol}`,
            subtitle: `${amount || '0'} ${isTempoChain ? validatorTokenSymbol : userTokenSymbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage: msg,
          }),
        );
      }
      if (!isUserCancellation(e)) {
        if (msg.includes('TransferHelper: TRANSFER_FROM_FAILED')) {
          toast.error('Failed to transfer tokens. Check your balance and approval.');
        } else {
          toast.error(msg.slice(0, 100) + '...');
        }
      }
    } finally {
      setIsAdding(false);
      setIsApproving(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !removeAmount) return;
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;
    const payload = {
      userTokenAddress: userToken as `0x${string}`,
      validatorTokenAddress: validatorToken as `0x${string}`,
      liquidityAmount: parseUnits(removeAmount, 18),
      to: address as `0x${string}`,
      feeToken: validatorToken as `0x${string}`,
    };

    try {
      await checkpointRewards();

      if (typeof burnLiquidity.mutateAsync === 'function') {
        hash = await burnLiquidity.mutateAsync(payload);
      } else {
        burnLiquidity.mutate(payload);
      }

      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `Remove Liquidity ${userTokenSymbol}/${validatorTokenSymbol}`,
        subtitle: `${removeAmount} LP`,
        status: 'pending',
        hash: hash ?? null,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      if (hash) {
        toast.custom(() => <TxToast hash={hash!} title="Liquidity removal submitted" />);
        await publicClient?.waitForTransactionReceipt({ hash });
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
        await refreshPrestoQueries(queryClient, { address, chainId });
        emitPrestoDataRefresh('liquidity');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to remove liquidity';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage: msg,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `Remove Liquidity ${userTokenSymbol}/${validatorTokenSymbol}`,
            subtitle: `${removeAmount || '0'} LP`,
            status: 'error',
            hash: hash ?? null,
            errorMessage: msg,
          }),
        );
      }
      if (!isUserCancellation(error)) toast.error(msg);
    }
  };

  const handleSetFeeTo = async () => {
    if (!walletClient || !publicClient || !factoryAddress || factoryAddress === ZERO_ADDRESS) return;
    if (!feeToInput || !/^0x[a-fA-F0-9]{40}$/.test(feeToInput)) {
      toast.error('Enter a valid fee recipient address');
      return;
    }
    setIsSettingFeeTo(true);
    try {
      const hash = await walletClient.writeContract({
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'setFeeTo',
        args: [feeToInput as `0x${string}`],
        account: address as `0x${string}`,
        chain: null,
      });
      toast.custom(() => <TxToast hash={hash as `0x${string}`} title="Protocol fee updated" />);
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      setFeeTo(feeToInput);
      setFeeToInput('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update protocol fee';
      if (!isUserCancellation(e)) toast.error(msg);
    } finally {
      setIsSettingFeeTo(false);
    }
  };

  const lpBalanceDisplay = balance ? Number(formatUnits(balance, 18)).toFixed(4) : '0.0000';
  const isFeeSetter =
    !!address &&
    !!feeToSetter &&
    feeToSetter.toLowerCase() === address.toLowerCase();
  const modeTitle = isTempoChain ? 'Fee Liquidity' : isArcTestnet ? 'Arc Stable Liquidity' : 'Liquidity Controls';
  const canRenderMaintenance = showMaintenance && !!pool;
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[16px]" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
          <div className="p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {modeTitle}
                  </p>
                  <h3 className="mt-2 text-[18px] font-extrabold tracking-tight text-slate-100">
                    {userTokenSymbol} / {validatorTokenSymbol}
                  </h3>
                </div>
              </div>
              <div className="hidden rounded-[12px] px-4 py-3 text-right lg:block" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Your LP Position
                </p>
                <p className="mt-1 text-[18px] font-extrabold text-slate-100">{lpBalanceDisplay}</p>
              </div>
            </div>
            <PoolStats
              userTokenSymbol={userTokenSymbol}
              validatorTokenSymbol={validatorTokenSymbol}
              reserveUserToken={pool?.reserveUserToken ?? null}
              reserveValidatorToken={pool?.reserveValidatorToken ?? null}
              userTokenDecimals={userTokenDecimals}
              validatorTokenDecimals={validatorTokenDecimals}
              totalShares={estimatedTotalShares}
              userShares={balance}
            />
            {pairManagementPanel ? <div className="mt-4">{pairManagementPanel}</div> : null}
          </div>

          <div className="p-6" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="rounded-[14px] p-5" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Add Liquidity
                  </p>
                  <h4 className="mt-1 text-[15px] font-extrabold text-slate-100">
                    Deposit {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                  </h4>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[10px] px-3 py-2 text-right" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      {isTempoChain ? 'Wallet' : `${userTokenSymbol} wallet`}
                    </p>
                    <p className="mt-1 text-[13px] font-semibold text-slate-100">
                      {Number(isTempoChain ? validatorTokenBalance : userTokenBalance).toFixed(4)} {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                    </p>
                  </div>
                  {!isTempoChain && (
                    <div className="rounded-[10px] px-3 py-2 text-right" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        {validatorTokenSymbol} wallet
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-slate-100">
                        {Number(validatorTokenBalance).toFixed(4)} {validatorTokenSymbol}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div ref={addActionRef} className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="mb-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <span>{isTempoChain ? 'Amount' : `${userTokenSymbol} amount`}</span>
                  <button
                    type="button"
                    onClick={() => setAmount(maxAddAmount)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#25c0f4] transition-colors"
                    style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
                  >
                    Max
                  </button>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-100 outline-none placeholder:text-slate-700"
                  />
                  <div className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-slate-200" style={{ border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b' }}>
                    {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-500">Pool side</span>
                  <span className="font-medium text-slate-100">
                    {isTempoChain ? `${validatorTokenSymbol} validator leg` : `${validatorTokenSymbol} stable hub leg`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-500">LP position</span>
                  <span className="font-medium text-slate-100">{lpBalanceDisplay}</span>
                </div>
                {!isTempoChain && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-500">{validatorTokenSymbol} required</span>
                    <span className="font-medium text-slate-100">
                      {Number(requiredPathAmount || '0').toFixed(4)} {validatorTokenSymbol}
                    </span>
                  </div>
                )}
                <div className="grid gap-3 pt-3 sm:grid-cols-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between text-[13px] sm:block">
                    <span className="text-slate-500">Est. LP</span>
                    <p className="font-semibold text-slate-100 sm:mt-1">
                      {estimatedLpTokens === null ? '--' : estimatedLpTokens.toFixed(4)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[13px] sm:block">
                    <span className="text-slate-500">New share</span>
                    <p className="font-semibold text-[#25c0f4] sm:mt-1">
                      {estimatedPoolShare === null ? '--' : `${estimatedPoolShare.toFixed(2)}%`}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddLiquidity}
                disabled={isAdding || !amount}
                className="mt-5 w-full rounded-[10px] px-4 py-3 text-[13px] font-bold text-[#090e1a] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: '#25c0f4' }}
              >
                {isApproving ? 'Approving...' : isAdding ? 'Adding Liquidity...' : `Add ${isTempoChain ? validatorTokenSymbol : userTokenSymbol} Liquidity`}
              </button>

              {!isTempoChain && (
                <div ref={removeActionRef} className="mt-4 rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Remove Liquidity
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-slate-100">
                        Exit {userTokenSymbol} / {validatorTokenSymbol}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => balance && onRemoveAmountChange?.(formatUnits(balance, 18))}
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#25c0f4] transition-colors"
                      style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
                    >
                      Max LP
                    </button>
                  </div>
                  <input
                    type="text"
                    value={removeAmount}
                    onChange={(e) => onRemoveAmountChange?.(e.target.value)}
                    placeholder="0.0"
                    className="mb-3 w-full rounded-[10px] px-4 py-3 text-[13px] font-semibold text-slate-100 outline-none placeholder:text-slate-600"
                    style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
                  />
                  <button
                    onClick={handleRemoveLiquidity}
                    disabled={burnLiquidity.isPending || !removeAmount}
                    className="w-full rounded-[10px] px-4 py-3 text-[13px] font-bold text-red-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}
                  >
                    {burnLiquidity.isPending ? 'Removing...' : 'Remove Position'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isTempoChain && (isFeeSetter || (!!feeTo && feeTo !== ZERO_ADDRESS)) && (
        <div className="grid gap-4 xl:grid-cols-1">
          <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Protocol Fee</p>
                <h4 className="mt-1 text-[15px] font-extrabold text-slate-100">Advanced controls</h4>
              </div>
              <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                {isFeeSetter ? 'Admin access' : 'Read only'}
              </span>
            </div>

            {factoryAddress === ZERO_ADDRESS ? (
              <div className="rounded-[12px] px-4 py-4 text-[13px] text-slate-500" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                Protocol fee configuration is not available for this deployment.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[12px] px-4 py-3" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Current recipient</p>
                    <p className="mt-2 break-all text-[13px] font-medium text-slate-100">{feeTo || 'Not set'}</p>
                  </div>
                  <div className="rounded-[12px] px-4 py-3" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Fee setter</p>
                    <p className="mt-2 break-all text-[13px] font-medium text-slate-100">{feeToSetter || 'Unknown'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={feeToInput}
                    onChange={(e) => setFeeToInput(e.target.value)}
                    placeholder="0x... fee recipient"
                    className="w-full rounded-[10px] px-4 py-3 text-[13px] text-slate-100 outline-none transition-colors placeholder:text-slate-600"
                    style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
                  />
                  <button
                    type="button"
                    onClick={handleSetFeeTo}
                    disabled={!isFeeSetter || isSettingFeeTo}
                    className="rounded-[10px] px-5 py-3 text-[13px] font-bold text-[#25c0f4] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
                  >
                    {isSettingFeeTo ? 'Setting...' : 'Update Fee Recipient'}
                  </button>
                </div>
                <p className="text-[12px] text-slate-500">
                  {isFeeSetter ? 'You are the current fee setter for this factory.' : 'Only the current fee setter can update the recipient address.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {canRenderMaintenance && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Pool Maintenance</p>
              <h4 className="mt-1 text-[15px] font-extrabold text-slate-100">Monitor and rebalance</h4>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <MonitorSwaps userToken={userToken} validatorToken={validatorToken} />
            </div>
            <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <RebalancePool
                userToken={userToken}
                validatorToken={validatorToken}
                userTokenDecimals={userTokenDecimals}
                validatorTokenDecimals={validatorTokenDecimals}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
