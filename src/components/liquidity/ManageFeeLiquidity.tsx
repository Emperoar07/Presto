import { useState, useEffect } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useChainId, useWalletClient, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';
import { Hooks } from '@/lib/tempo';
import { MonitorSwaps } from './MonitorSwaps';
import { RebalancePool } from './RebalancePool';
import { PoolStats } from './PoolStats';
import { addFeeLiquidity, getTokenBalance, quoteHubLiquidityPathAmount } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import type { PublicClient } from 'viem';
import { FACTORY_ABI, getContractAddresses, isArcChain, isTempoNativeChain, ZERO_ADDRESS } from '@/config/contracts';

interface ManageFeeLiquidityProps {
  userToken: string;
  validatorToken: string;
  userTokenDecimals?: number;
  validatorTokenDecimals?: number;
  userTokenSymbol?: string;
  validatorTokenSymbol?: string;
  showMaintenance?: boolean;
}

export function ManageFeeLiquidity({
  userToken,
  validatorToken,
  userTokenDecimals = 18,
  validatorTokenDecimals = 18,
  userTokenSymbol = 'Token',
  validatorTokenSymbol = 'pathUSD',
  showMaintenance = true,
}: ManageFeeLiquidityProps) {
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

  const estimatedTotalShares = pool?.reserveValidatorToken ? pool.reserveValidatorToken * 2n : null;

  const handleAddLiquidity = async () => {
    if (!address || !amount || !walletClient || !publicClient) return;
    setIsAdding(true);
    setIsApproving(false);
    try {
      const hash = await addFeeLiquidity(
        walletClient,
        publicClient as unknown as PublicClient,
        address,
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
      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setAmount('');
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Transaction failed';
      if (msg.includes('TransferHelper: TRANSFER_FROM_FAILED')) {
        toast.error('Failed to transfer tokens. Check your balance and approval.');
      } else {
        toast.error(msg.slice(0, 100) + '...');
      }
    } finally {
      setIsAdding(false);
      setIsApproving(false);
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
      toast.error(msg);
    } finally {
      setIsSettingFeeTo(false);
    }
  };

  const lpBalanceDisplay = balance ? Number(formatUnits(balance, 18)).toFixed(4) : '0.0000';
  const isFeeSetter =
    !!address &&
    !!feeToSetter &&
    feeToSetter.toLowerCase() === address.toLowerCase();
  const modeTitle = isTempoChain ? 'Tempo Fee Liquidity' : isArcTestnet ? 'Arc Stable Liquidity' : 'Liquidity Controls';
  const modeDescription = isTempoChain
    ? `${validatorTokenSymbol} acts as the validator-side asset for Tempo fee pools and supports fee-routed execution.`
    : isArcTestnet
      ? `${validatorTokenSymbol} acts as the stable hub asset on Arc while you size deposits with ${userTokenSymbol}.`
      : 'Liquidity controls adapt to the connected network and only show supported flows.';

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-cyan-950/20">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
          <div className="border-b border-slate-200/80 p-6 dark:border-white/10 xl:border-b-0 xl:border-r">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {modeTitle}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                    {userTokenSymbol} / {validatorTokenSymbol}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {modeDescription}
                  </p>
                </div>
              </div>
              <div className="hidden rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-right shadow-sm dark:border-white/10 dark:bg-white/[0.03] lg:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Your LP Position
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{lpBalanceDisplay}</p>
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
              inputAmount={amount}
            />
          </div>

          <div className="p-6">
            <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Add Liquidity
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    Deposit {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                  </h4>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {isTempoChain ? 'Wallet' : `${userTokenSymbol} wallet`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {Number(isTempoChain ? validatorTokenBalance : userTokenBalance).toFixed(4)} {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                    </p>
                  </div>
                  {!isTempoChain && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {validatorTokenSymbol} wallet
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {Number(validatorTokenBalance).toFixed(4)} {validatorTokenSymbol}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  <span>{isTempoChain ? 'Amount' : `${userTokenSymbol} amount`}</span>
                  <button
                    type="button"
                    onClick={() => setAmount(isTempoChain ? validatorTokenBalance : userTokenBalance)}
                    className="rounded-full border border-primary/20 px-2.5 py-1 text-primary transition-colors hover:bg-primary/10"
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
                    className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700"
                  />
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                    {isTempoChain ? validatorTokenSymbol : userTokenSymbol}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Pool side</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {isTempoChain ? `${validatorTokenSymbol} validator leg` : `${validatorTokenSymbol} stable hub leg`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">LP position</span>
                  <span className="font-medium text-slate-900 dark:text-white">{lpBalanceDisplay}</span>
                </div>
                {!isTempoChain && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{validatorTokenSymbol} required</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {Number(requiredPathAmount || '0').toFixed(4)} {validatorTokenSymbol}
                    </span>
                  </div>
                )}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {isTempoChain
                    ? 'Tempo mints LP shares from the validator-side deposit ratio and uses those shares to support fee-routed pools.'
                    : `Arc pairs your ${userTokenSymbol} deposit with ${validatorTokenSymbol} automatically using the live pool ratio, so both approvals are handled before the add transaction.`}
                </div>
              </div>

              <button
                onClick={handleAddLiquidity}
                disabled={isAdding || !amount}
                className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-background-dark"
              >
                {isApproving ? 'Approving...' : isAdding ? 'Adding Liquidity...' : `Add ${isTempoChain ? validatorTokenSymbol : userTokenSymbol} Liquidity`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isTempoChain && (isFeeSetter || (!!feeTo && feeTo !== ZERO_ADDRESS)) && (
        <div className="grid gap-4 xl:grid-cols-1">
          <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Protocol Fee
                </p>
                <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Advanced controls</h4>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                {isFeeSetter ? 'Admin access' : 'Read only'}
              </span>
            </div>

            {factoryAddress === ZERO_ADDRESS ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-400">
                Protocol fee configuration is not available for this Tempo deployment.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Current recipient</p>
                    <p className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-white">{feeTo || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fee setter</p>
                    <p className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-white">{feeToSetter || 'Unknown'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={feeToInput}
                    onChange={(e) => setFeeToInput(e.target.value)}
                    placeholder="0x... fee recipient"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-primary/40 dark:border-white/10 dark:bg-slate-950/40 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSetFeeTo}
                    disabled={!isFeeSetter || isSettingFeeTo}
                    className="rounded-2xl border border-primary/20 bg-primary/10 px-5 py-3 text-sm font-bold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSettingFeeTo ? 'Setting...' : 'Update Fee Recipient'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isFeeSetter ? 'You are the current fee setter for this factory.' : 'Only the current fee setter can update the recipient address.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showMaintenance && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Pool Maintenance
              </p>
              <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Monitor and rebalance</h4>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
              <MonitorSwaps userToken={userToken} validatorToken={validatorToken} />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
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
