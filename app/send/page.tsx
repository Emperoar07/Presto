'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits, isAddress, getAddress, parseAbi } from 'viem';
import toast from 'react-hot-toast';
import { getTokens, Token } from '@/config/tokens';
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

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)',
]);

// ─── Custom token + balance hook ────────────────────────────────────────────
function useCustomTokenInfo(
  publicClient: ReturnType<typeof usePublicClient>,
  address: string | undefined,
  customAddress: string,
) {
  const [info, setInfo] = useState<{
    token: Token | null;
    balance: string;
    loading: boolean;
    error: string | null;
  }>({ token: null, balance: '0', loading: false, error: null });

  useEffect(() => {
    if (!customAddress || !isAddress(customAddress) || !publicClient || !address) {
      setInfo({ token: null, balance: '0', loading: false, error: null });
      return;
    }

    let cancelled = false;
    setInfo((p) => ({ ...p, loading: true, error: null }));

    (async () => {
      try {
        const tokenAddr = getAddress(customAddress) as `0x${string}`;
        const [symbol, name, decimals, rawBal] = await Promise.all([
          publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'name' }).catch(() => 'Unknown'),
          publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'decimals' }),
          publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }),
        ]);
        if (cancelled) return;
        const tok: Token = { symbol: symbol as string, name: name as string, address: tokenAddr, decimals: Number(decimals) };
        setInfo({ token: tok, balance: formatUnits(rawBal as bigint, Number(decimals)), loading: false, error: null });
      } catch {
        if (!cancelled) setInfo({ token: null, balance: '0', loading: false, error: 'Not a valid ERC-20 token' });
      }
    })();

    return () => { cancelled = true; };
  }, [customAddress, publicClient, address]);

  return info;
}

// ─── Send Page ──────────────────────────────────────────────────────────────
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
  const [isSending, setIsSending] = useState(false);

  // Token picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Custom token from pasted address
  const isSearchAnAddress = search.length >= 10 && isAddress(search);
  const customToken = useCustomTokenInfo(publicClient, address, isSearchAnAddress ? search : '');

  // Auto-select: if user pastes a valid address and a token is detected, auto-pick it
  useEffect(() => {
    if (!isSearchAnAddress || !pickerOpen) return;
    // Check if it matches a listed token first
    const listed = tokens.find((t) => t.address.toLowerCase() === search.toLowerCase());
    if (listed) {
      handleSelectToken(listed);
      return;
    }
    // Auto-select custom token once detected
    if (customToken.token && !customToken.loading) {
      handleSelectToken(customToken.token);
    }
  }, [isSearchAnAddress, customToken.token, customToken.loading, pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [pickerOpen]);

  const token = selectedToken ?? tokens[0] ?? null;
  const isCustom = token && !tokens.some((t) => t.address.toLowerCase() === token.address.toLowerCase());

  // Balance: use custom lookup for custom tokens, standard balances for listed ones
  const [customBal, setCustomBal] = useState('0');
  useEffect(() => {
    if (!isCustom || !publicClient || !address || !token) { setCustomBal('0'); return; }
    let cancelled = false;
    (async () => {
      try {
        const raw = await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        if (!cancelled) setCustomBal(formatUnits(raw as bigint, token.decimals));
      } catch { if (!cancelled) setCustomBal('0'); }
    })();
    return () => { cancelled = true; };
  }, [isCustom, publicClient, address, token]);

  const bal = isCustom ? customBal : token ? (balances as Record<string, string>)[token.address] ?? '0' : '0';
  const balNum = parseFloat(bal) || 0;

  const recipientValid = recipient.length > 0 && isAddress(recipient);
  const recipientIsSelf = recipientValid && address && getAddress(recipient) === getAddress(address);
  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance = amountNum > balNum;

  const canSend = isConnected && token && amountNum > 0 && recipientValid && !recipientIsSelf && !exceedsBalance && !isSending;

  const buttonLabel = useMemo(() => {
    if (isSending) return null;
    if (!isConnected) return null;
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

  // Filtered token list for picker
  const filteredTokens = useMemo(() => {
    if (!search) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q),
    );
  }, [tokens, search]);

  const handleSelectToken = (t: Token) => {
    setSelectedToken(t);
    setPickerOpen(false);
    setSearch('');
  };

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
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [to, parsedAmount],
          account: address as `0x${string}`,
          chain: null,
        },
        { onRetry: (attempt) => { toast.loading(`Retrying with higher gas (attempt ${attempt})...`, { duration: 1200 }); } },
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

      toast.custom(() => <TxToast hash={hash!} title="Transfer submitted" />);

      await publicClient.waitForTransactionReceipt({ hash: hash! });

      if (activityId) patchLocalActivityItem(activityId, { status: 'success', hash });

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
          }),
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
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-2 md:pt-6">
        <div className="relative w-full max-w-[520px]">
          <div className="mx-auto w-full max-w-[381px] overflow-visible rounded-[14px] shadow-[0_18px_48px_rgba(2,6,23,0.34)]" style={{ background: SURF, border: BDR }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: BDR }}>
            <div>
              <p className="text-[13px] font-bold text-slate-100">Send Tokens</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Transfer any ERC-20 token to any wallet</p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            {/* Token + Amount */}
            <div className="relative z-20 rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">Token</span>
                <span className="text-[11px] text-slate-500">
                  Balance: <span className="font-semibold text-slate-400">{balNum > 0 ? bal : '0'}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Token picker button */}
                <div className="relative" ref={pickerRef}>
                  <button
                    onClick={() => setPickerOpen(!pickerOpen)}
                    className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                  >
                    {token ? (
                      <>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[7px] font-extrabold text-white">
                          {token.symbol[0]}
                        </span>
                        <span>{token.symbol}</span>
                      </>
                    ) : (
                      <span>Select</span>
                    )}
                    <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                  </button>

                  {/* Dropdown */}
                  {pickerOpen && (
                    <div
                      className="absolute left-0 top-[calc(100%+4px)] z-50 w-[280px] overflow-hidden rounded-[12px] shadow-xl"
                      style={{ background: '#111827', border: BDR }}
                    >
                      <div className="p-2">
                        <input
                          type="text"
                          placeholder="Search or paste token address..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value.trim())}
                          className="w-full rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-3 py-2 text-[12px] text-white placeholder:text-slate-500 outline-none focus:border-primary/40"
                          autoFocus
                          spellCheck={false}
                        />
                      </div>

                      <div className="max-h-[240px] overflow-y-auto">
                        {/* Listed tokens */}
                        {filteredTokens.map((t) => (
                          <button
                            key={t.address}
                            onClick={() => handleSelectToken(t)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                          >
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[8px] font-extrabold text-white">
                              {t.symbol[0]}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-white">{t.symbol}</p>
                              <p className="truncate text-[10px] text-slate-500">{t.name}</p>
                            </div>
                            {token?.address.toLowerCase() === t.address.toLowerCase() && (
                              <span className="material-symbols-outlined text-[14px] text-primary">check</span>
                            )}
                          </button>
                        ))}

                        {/* Custom token detected from pasted address */}
                        {isSearchAnAddress && (
                          <>
                            <div className="mx-3 border-t border-white/[0.06]" />
                            {customToken.loading ? (
                              <div className="px-3 py-3 text-center text-[11px] text-slate-500">
                                Detecting token...
                              </div>
                            ) : customToken.error ? (
                              <div className="px-3 py-3 text-center text-[11px] text-red-400">
                                {customToken.error}
                              </div>
                            ) : customToken.token ? (
                              <button
                                onClick={() => handleSelectToken(customToken.token!)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                              >
                                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-extrabold text-white">
                                  {customToken.token.symbol[0]}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12px] font-semibold text-white">
                                    {customToken.token.symbol}
                                    <span className="ml-1.5 rounded bg-emerald-500/20 px-1 py-px text-[9px] font-bold text-emerald-400">
                                      IMPORTED
                                    </span>
                                  </p>
                                  <p className="truncate text-[10px] text-slate-500">
                                    {customToken.token.name} &middot; Bal: {parseFloat(customToken.balance).toFixed(4)}
                                  </p>
                                </div>
                              </button>
                            ) : null}
                          </>
                        )}

                        {filteredTokens.length === 0 && !isSearchAnAddress && (
                          <div className="px-3 py-4 text-center text-[11px] text-slate-500">
                            No tokens found. Paste a contract address to import.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

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
              {isCustom && token && (
                <p className="mt-1.5 truncate text-[10px] text-slate-500">
                  Contract: {token.address}
                </p>
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
                  <span className="font-semibold text-slate-300">{amount} {token!.symbol}</span>
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
    </div>
  );
}
