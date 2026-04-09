'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits, isAddress, getAddress } from 'viem';
import { parseAbi } from 'viem';
import toast from 'react-hot-toast';
import { getTokens, Token } from '@/config/tokens';
import { TokenModal } from '@/components/common/TokenModal';
import { TxToast } from '@/components/common/TxToast';
import { writeContractWithRetry } from '@/lib/txRetry';
import { parseContractError, logError, isUserCancellation } from '@/lib/errorHandling';
import { useTokenBalances } from '@/hooks/useApiQueries';
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';

const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
]);

export default function SendPage() {
  const chainId = useChainId();
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { data: balances = {} } = useTokenBalances();

  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const token = selectedToken ?? tokens[0] ?? null;
  const bal = token ? (balances as Record<string, string>)[token.address] ?? '0' : '0';
  const balNum = parseFloat(bal) || 0;

  const recipientValid = recipient.length > 0 && isAddress(recipient);
  const recipientIsSelf = recipientValid && address && getAddress(recipient) === getAddress(address);
  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance = amountNum > balNum;

  const canSend = isConnected && token && amountNum > 0 && recipientValid && !recipientIsSelf && !exceedsBalance && !isSending;

  const buttonLabel = useMemo(() => {
    if (isSending) return null; // spinner shown instead
    if (!isConnected) return null; // connect button shown
    if (!token) return 'Select Token';
    if (!amount || amountNum === 0) return 'Enter Amount';
    if (exceedsBalance) return 'Insufficient Balance';
    if (recipient.length > 0 && !recipientValid) return 'Invalid Address';
    if (recipientIsSelf) return 'Cannot Send to Self';
    if (!recipient) return 'Enter Recipient';
    return 'Send Tokens';
  }, [isSending, isConnected, token, amount, amountNum, exceedsBalance, recipient, recipientValid, recipientIsSelf]);

  const handleMax = useCallback(() => {
    if (balNum > 0) setAmount(bal);
  }, [bal, balNum]);

  const handleAmountChange = useCallback((value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) setAmount(value);
  }, []);

  const handleSend = async () => {
    if (!walletClient || !address || !publicClient || !token || !canSend) return;

    setIsSending(true);
    let hash: `0x${string}` | undefined;
    let activityId: string | null = null;

    try {
      const parsedAmount = parseUnits(amount, token.decimals);
      const to = getAddress(recipient) as `0x${string}`;

      hash = await writeContractWithRetry(
        walletClient,
        publicClient ?? undefined,
        {
          address: token.address as `0x${string}`,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to, parsedAmount],
          account: address,
          chain: null,
        },
        {
          onRetry: (attempt) => {
            toast.loading(`Retrying with higher gas (attempt ${attempt})...`, { duration: 1200 });
          },
        }
      );

      const pendingActivity = createLocalActivityItem({
        category: 'send',
        title: `Send ${token.symbol}`,
        subtitle: `${amount} ${token.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
        status: 'pending',
        hash,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      toast.custom(() => <TxToast hash={hash} title="Transfer submitted" />);

      await publicClient.waitForTransactionReceipt({ hash });

      if (activityId) {
        patchLocalActivityItem(activityId, { status: 'success', hash });
      }

      setAmount('');
      setRecipient('');
      toast.success('Transfer completed!');
    } catch (e: unknown) {
      logError(e, 'Send failed');

      const errorMessage = e instanceof Error ? e.message : 'Transfer failed';
      if (activityId) {
        patchLocalActivityItem(activityId, { status: 'error', hash: hash ?? null, errorMessage });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'send',
            title: `Send ${token.symbol}`,
            subtitle: `${amount || '0'} ${token.symbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage,
          })
        );
      }

      if (!isUserCancellation(e)) {
        const parsed = parseContractError(e);
        toast.error(`${parsed.title}: ${parsed.message}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex justify-center">
        <div className="relative w-full max-w-[420px]">
          <div className="overflow-hidden rounded-[14px] shadow-[0_18px_48px_rgba(2,6,23,0.34)]" style={{ background: SURF, border: BDR }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: BDR }}>
              <div>
                <p className="text-[13px] font-bold text-slate-100">Send Tokens</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Transfer to any wallet</p>
              </div>
              <span className="material-symbols-outlined text-[20px] text-slate-500">send</span>
            </div>

            <div className="space-y-3 p-4">
              {/* Token + Amount */}
              <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500">Token</span>
                  <span className="text-[11px] text-slate-500">
                    Balance: <span className="font-semibold text-slate-400">{balNum > 0 ? bal : '0'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowTokenModal(true)}
                    className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                  >
                    <span>{token?.symbol ?? 'Select'}</span>
                    <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="w-0 flex-1 bg-transparent text-right text-[22px] font-semibold text-white placeholder:text-white/30 outline-none"
                  />
                  {balNum > 0 && (
                    <button onClick={handleMax} className="text-[11px] font-bold text-primary">MAX</button>
                  )}
                </div>
                {amountNum > 0 && (
                  <p className="mt-1.5 text-right text-[11px] text-slate-500">~ ${amountNum.toFixed(2)}</p>
                )}
              </div>

              {/* Recipient */}
              <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
                <span className="mb-2 block text-[11px] font-medium text-slate-500">Recipient Address</span>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  className="w-full bg-transparent text-[14px] font-medium text-white placeholder:text-white/30 outline-none"
                  spellCheck={false}
                  autoComplete="off"
                />
                {recipient.length > 0 && !recipientValid && (
                  <p className="mt-1.5 text-[11px] text-red-400">Invalid Ethereum address</p>
                )}
                {recipientIsSelf && (
                  <p className="mt-1.5 text-[11px] text-amber-400">Cannot send tokens to yourself</p>
                )}
              </div>

              {/* Summary */}
              {canSend && (
                <div className="rounded-[10px] border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Sending</span>
                    <span className="font-semibold text-slate-300">{amount} {token.symbol}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">To</span>
                    <span className="font-mono font-semibold text-slate-300">{recipient.slice(0, 6)}...{recipient.slice(-4)}</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {!isConnected ? (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="w-full rounded-[12px] bg-primary py-3 text-[13px] font-bold text-[#0f172a] transition-all hover:opacity-95"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="w-full rounded-[12px] bg-primary py-3 text-[13px] font-bold text-[#0f172a] transition-all active:scale-[0.98] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </span>
                  ) : buttonLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <TokenModal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        selectedToken={token ?? undefined}
        onSelect={(t) => {
          setSelectedToken(t);
          setShowTokenModal(false);
        }}
      />
    </div>
  );
}
