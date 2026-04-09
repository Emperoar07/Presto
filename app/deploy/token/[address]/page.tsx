'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { parseUnits, formatUnits, isAddress } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { writeContractWithRetry } from '@/lib/txRetry';
import { addFeeLiquidity } from '@/lib/tempoClient';
import { parseContractError, isUserCancellation } from '@/lib/errorHandling';
import { getExplorerBaseUrl } from '@/lib/explorer';
import { getHubToken } from '@/config/tokens';
import { ERC20_ABI } from '@/config/contracts';
import { loadDeployments } from '@/lib/deployUtils';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

export default function ManageTokenPage() {
  const params = useParams();
  const tokenAddress = params.address as string;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number; totalSupply: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [seedAmount, setSeedAmount] = useState('');
  const [seedStage, setSeedStage] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [mintTo, setMintTo] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [minting, setMinting] = useState(false);

  const hubToken = getHubToken(ARC_CHAIN_ID);
  const hubSymbol = hubToken?.symbol ?? 'USDC';
  const hubAddress = hubToken?.address ?? '';
  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);

  useEffect(() => {
    async function load() {
      if (!publicClient || !isAddress(tokenAddress)) { setLoading(false); return; }
      try {
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          publicClient.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: 'name' }).catch(() => ''),
          publicClient.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => ''),
          publicClient.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
          publicClient.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [tokenAddress as `0x${string}`] }).catch(() => 0n),
        ]);

        // Try to get name from localStorage deployment records
        const deployments = address ? loadDeployments(address) : [];
        const deployment = deployments.find((d) => d.address.toLowerCase() === tokenAddress.toLowerCase());

        setTokenInfo({
          name: deployment?.name ?? String(name),
          symbol: String(symbol),
          decimals: Number(decimals),
          totalSupply: formatUnits(totalSupply as bigint, Number(decimals)),
        });
      } catch {
        setTokenInfo(null);
      }
      setLoading(false);
    }
    load();
  }, [publicClient, tokenAddress, address]);

  async function handleSeedLiquidity() {
    if (!walletClient || !publicClient || !address || !tokenInfo) return;
    setSeeding(true);
    try {
      const amount = parseUnits(seedAmount, tokenInfo.decimals);
      const hash = await addFeeLiquidity(
        walletClient, publicClient, address,
        tokenAddress, hubAddress, amount,
        (stage) => setSeedStage(stage === 'approving' ? 'Approving tokens...' : 'Adding liquidity...'),
        ARC_CHAIN_ID,
      );
      if (hash) {
        await publicClient.waitForTransactionReceipt({ hash });
        toast.custom(() => <TxToast hash={hash} title="Liquidity seeded!" />, { duration: 6000 });
      }
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setSeeding(false);
      setSeedStage(null);
    }
  }

  async function handleMintMore() {
    if (!walletClient || !publicClient || !tokenInfo) return;
    setMinting(true);
    try {
      const amount = parseUnits(mintAmount, tokenInfo.decimals);
      const to = (mintTo || address) as `0x${string}`;
      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [to, amount],
        account: address as `0x${string}`,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.custom(() => <TxToast hash={hash} title={`Minted ${mintAmount} ${tokenInfo.symbol}`} />, { duration: 6000 });
      setMintAmount('');
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setMinting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
        <div className="flex items-start justify-center pt-10">
          <p className="text-[13px] text-slate-500">Loading token info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-6 md:pt-10">
        <div className="w-full max-w-[520px] space-y-4">
          {/* Token Info */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">
                Manage {tokenInfo?.symbol ?? 'Token'}
              </p>
            </div>
            <div className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Contract</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-slate-300">
                    {tokenAddress.slice(0, 8)}...{tokenAddress.slice(-6)}
                  </span>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(tokenAddress); toast.success('Copied'); }} className="text-slate-500 hover:text-primary">
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  </button>
                  <a href={`${explorerBase}/address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </div>
              </div>
              {tokenInfo && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Name</span>
                    <span className="text-[12px] text-slate-300">{tokenInfo.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Symbol</span>
                    <span className="text-[12px] text-slate-300">{tokenInfo.symbol}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Seed Liquidity */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Seed Liquidity on Hub AMM</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">Pair with {hubSymbol}</p>
            </div>
            <div className="space-y-3 p-5">
              <input
                type="text"
                value={seedAmount}
                onChange={(e) => setSeedAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={`Amount of ${tokenInfo?.symbol ?? 'tokens'}`}
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={handleSeedLiquidity}
                disabled={!seedAmount || Number(seedAmount) <= 0 || seeding}
                className="w-full rounded-[10px] bg-emerald-600 py-[11px] text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {seeding ? (seedStage ?? 'Processing...') : 'Seed Liquidity'}
              </button>
            </div>
          </div>

          {/* Mint More */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Mint More Tokens</p>
            </div>
            <div className="space-y-3 p-5">
              <input
                type="text"
                value={mintTo}
                onChange={(e) => setMintTo(e.target.value)}
                placeholder={address ?? '0x... recipient (blank = you)'}
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
              />
              <input
                type="text"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Amount to mint"
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={handleMintMore}
                disabled={!mintAmount || Number(mintAmount) <= 0 || minting}
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] py-[11px] text-[13px] font-bold text-slate-100 transition-colors hover:bg-[#2d3f56] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {minting ? 'Minting...' : 'Mint Tokens'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
