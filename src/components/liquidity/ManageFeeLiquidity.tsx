import { useState, useEffect } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useChainId, useWalletClient, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';
import { Hooks } from '@/lib/tempo';
import { MonitorSwaps } from './MonitorSwaps';
import { RebalancePool } from './RebalancePool';
import { addFeeLiquidity, withdrawDexBalance, getTokenBalance } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import type { PublicClient } from 'viem';
import { FACTORY_ABI, getContractAddresses, ZERO_ADDRESS } from '@/config/contracts';

interface ManageFeeLiquidityProps {
    userToken: string;
    validatorToken: string;
    userTokenDecimals?: number;
    validatorTokenDecimals?: number;
    showMaintenance?: boolean;
}

export function ManageFeeLiquidity({ 
    userToken, 
    validatorToken, 
    userTokenDecimals = 18, 
    validatorTokenDecimals = 18,
    showMaintenance = true
}: ManageFeeLiquidityProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const factoryAddress = getContractAddresses(chainId).FACTORY_ADDRESS;
  const [amount, setAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [validatorTokenBalance, setValidatorTokenBalance] = useState('0');
  const [feeTo, setFeeTo] = useState<string>('');
  const [feeToSetter, setFeeToSetter] = useState<string>('');
  const [feeToInput, setFeeToInput] = useState('');
  const [isSettingFeeTo, setIsSettingFeeTo] = useState(false);

  useEffect(() => {
      const fetchBalance = async () => {
          if (publicClient && address && validatorToken) {
              const bal = await getTokenBalance(publicClient, address, validatorToken, validatorTokenDecimals);
              setValidatorTokenBalance(bal);
          }
      };
      fetchBalance();
  }, [publicClient, address, validatorToken, validatorTokenDecimals, isAdding]);

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

  const { data: dexBalance, refetch: refetchDexBalance } = (Hooks.dex.useDexBalance
    ? Hooks.dex.useDexBalance({
        user: (address || '0x0000000000000000000000000000000000000000') as `0x${string}`,
        token: validatorToken as `0x${string}`,
      })
    : { data: null, refetch: async () => {} }) as { data: bigint | null; refetch: () => Promise<unknown> };

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
            parseUnits(amount, validatorTokenDecimals),
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
      }
      finally {
        setIsAdding(false);
        setIsApproving(false);
      }
  };

  const handleWithdrawDexBalance = async () => {
    if (!address || !walletClient || !publicClient) return;
    if (!dexBalance || dexBalance === 0n) return;
    setWithdrawError(null);
    setIsWithdrawing(true);
    try {
      const hash = await withdrawDexBalance(
        walletClient,
        publicClient as unknown as PublicClient,
        address,
        validatorToken as `0x${string}`,
        dexBalance,
        chainId
      );
      toast.custom(() => <TxToast hash={hash} title="DEX balance withdrawn" />);
      await refetchDexBalance();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setWithdrawError(message);
    } finally {
      setIsWithdrawing(false);
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

  return (
    <div className="space-y-7">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">Liquidity overview</span>
            <span className="text-xs text-zinc-500">Validator token: pathUSD</span>
          </div>
          <div className="p-5 rounded-xl bg-black/20 border border-white/5 text-sm space-y-3">
            <div className="flex justify-between font-bold text-white">
                <span className="text-zinc-400">LP Token Balance</span>
                <span>{balance ? formatUnits(balance, 18) : '0'}</span>
            </div>
            <div className="flex justify-between text-zinc-300">
                <span className="text-zinc-400">User Reserves</span>
                <span>{pool ? formatUnits(pool.reserveUserToken, userTokenDecimals) : '0'}</span>
            </div>
            <div className="flex justify-between text-zinc-300">
                <span className="text-zinc-400">Validator Reserves</span>
                <span>{pool ? formatUnits(pool.reserveValidatorToken, validatorTokenDecimals) : '0'}</span>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/30 p-2 text-[11px] text-zinc-500">
              Raw LP: {balance ?? 0n} | Pair: {userToken.slice(0, 6)}.../{validatorToken.slice(0, 6)}...
            </div>
        </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">DEX balance</span>
            <span className="text-xs text-zinc-500">Withdraw anytime</span>
          </div>
          <div className="p-5 rounded-xl bg-black/20 border border-white/5 space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">DEX Balance (pathUSD)</span>
              <span className="text-sm text-white">
                {dexBalance ? formatUnits(dexBalance, validatorTokenDecimals) : '0'}
              </span>
            </div>
            {withdrawError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
                {withdrawError}
              </div>
            )}
            <button
              onClick={handleWithdrawDexBalance}
              disabled={isWithdrawing || !dexBalance || dexBalance === 0n}
              className="w-full py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-400 font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {isWithdrawing ? 'Withdrawing...' : 'Withdraw All DEX Balance'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white/80">Add liquidity</span>
                <span className="text-xs text-zinc-500">Validator bal: {Number(validatorTokenBalance).toFixed(4)}</span>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                <p>First liquidity provider burns 1,000 units of LP (about 0.002 USD). This is expected.</p>
            </div>

            <div className="flex gap-2">
                <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-full p-3 rounded-xl bg-black/20 border border-white/5 text-white outline-none focus:border-[#00F3FF]/50 transition-colors"
                />
                <button 
                    onClick={handleAddLiquidity}
                    disabled={isAdding}
                    className="px-6 py-2 rounded-xl font-bold bg-[#00F3FF]/20 text-[#00F3FF] border border-[#00F3FF]/50 hover:bg-[#00F3FF]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isApproving ? 'Approving...' : isAdding ? 'Adding...' : 'Add'}
                </button>
            </div>
            <p className="text-xs text-zinc-500">
                Adds validator token only; LP tokens are minted based on pool ratio.
            </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">Protocol fee</span>
            <span className="text-xs text-zinc-500">Uniswap-style fee receiver</span>
          </div>
          <div className="p-5 rounded-xl bg-black/20 border border-white/5 space-y-4">
            {factoryAddress === ZERO_ADDRESS ? (
              <div className="text-xs text-zinc-500">
                Protocol fee is not available on this network.
              </div>
            ) : (
              <>
                <div className="text-xs text-zinc-500">
                  Current fee recipient: <span className="text-zinc-300">{feeTo || 'Not set'}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  Fee setter: <span className="text-zinc-300">{feeToSetter || 'Unknown'}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feeToInput}
                    onChange={(e) => setFeeToInput(e.target.value)}
                    placeholder="0x… fee recipient"
                    className="w-full p-3 rounded-xl bg-black/20 border border-white/5 text-white outline-none focus:border-[#00F3FF]/50 transition-colors text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSetFeeTo}
                    disabled={!address || isSettingFeeTo || feeToSetter.toLowerCase() !== (address ?? '').toLowerCase()}
                    className="px-4 py-2 rounded-xl font-bold bg-[#00F3FF]/20 text-[#00F3FF] border border-[#00F3FF]/50 hover:bg-[#00F3FF]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                  >
                    {isSettingFeeTo ? 'Setting...' : 'Set'}
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Only the fee setter can update the recipient address.
                </div>
              </>
            )}
          </div>
        </div>

        {showMaintenance && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white/80">Pool maintenance</span>
              <span className="text-xs text-zinc-500">Monitor + rebalance</span>
            </div>
            <MonitorSwaps userToken={userToken} validatorToken={validatorToken} />
            <RebalancePool 
                userToken={userToken} 
                validatorToken={validatorToken} 
                userTokenDecimals={userTokenDecimals}
                validatorTokenDecimals={validatorTokenDecimals}
            />
          </div>
        )}
    </div>
  );
}

