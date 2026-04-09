'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { parseUnits, formatUnits } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { loadTokenArtifact, deployContract, saveDeployment, type DeployResult } from '@/lib/deployUtils';
import { writeContractWithRetry } from '@/lib/txRetry';
import { addFeeLiquidity } from '@/lib/tempoClient';
import { parseContractError, isUserCancellation } from '@/lib/errorHandling';
import { getExplorerTxUrl, getExplorerBaseUrl } from '@/lib/explorer';
import { getHubToken } from '@/config/tokens';
import { ERC20_ABI } from '@/config/contracts';
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

export default function DeployTokenPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [initialSupply, setInitialSupply] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Seed liquidity state
  const [seedAmount, setSeedAmount] = useState('');
  const [seedStage, setSeedStage] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Mint more state
  const [mintTo, setMintTo] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [minting, setMinting] = useState(false);

  const hubToken = getHubToken(ARC_CHAIN_ID);
  const hubSymbol = hubToken?.symbol ?? 'USDC';
  const hubAddress = hubToken?.address ?? '';

  const canDeploy = name.trim() && symbol.trim() && initialSupply.trim() && Number(initialSupply) > 0 && !deploying;

  async function handleDeploy() {
    if (!walletClient || !publicClient || !address) {
      toast.error('Connect your wallet first');
      return;
    }

    setDeploying(true);
    const activity = createLocalActivityItem({
      category: 'deploy',
      title: `Deploy ${symbol.toUpperCase() || 'Token'}`,
      subtitle: `${initialSupply} supply, ${decimals} decimals`,
      status: 'pending',
    });
    upsertLocalActivityHistoryItem(activity);

    try {
      const artifact = await loadTokenArtifact();
      const dec = parseInt(decimals) || 18;
      const supply = parseUnits(initialSupply, dec);

      const result = await deployContract(walletClient, publicClient, {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [name, symbol.toUpperCase(), dec, supply],
      });

      setDeployResult(result);

      saveDeployment({
        address: result.address,
        chainId: ARC_CHAIN_ID,
        type: 'token',
        name,
        symbol: symbol.toUpperCase(),
        owner: address,
        hash: result.hash,
        createdAt: Date.now(),
        metadata: { decimals: dec.toString(), initialSupply },
      });

      patchLocalActivityItem(activity.id, { status: 'success', hash: result.hash });
      toast.custom((t) => <TxToast hash={result.hash} title={`${symbol.toUpperCase()} deployed!`} />, { duration: 6000 });
    } catch (err) {
      if (isUserCancellation(err)) {
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: 'Cancelled' });
        toast.error('Deploy cancelled');
      } else {
        const parsed = parseContractError(err);
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: parsed.message });
        toast.error(parsed.message);
      }
    } finally {
      setDeploying(false);
    }
  }

  async function handleSeedLiquidity() {
    if (!walletClient || !publicClient || !address || !deployResult) return;
    setSeeding(true);

    const activity = createLocalActivityItem({
      category: 'deploy',
      title: `Seed liquidity for ${symbol.toUpperCase()}`,
      subtitle: `${seedAmount} tokens`,
      status: 'pending',
    });
    upsertLocalActivityHistoryItem(activity);

    try {
      const dec = parseInt(decimals) || 18;
      const amount = parseUnits(seedAmount, dec);

      const hash = await addFeeLiquidity(
        walletClient,
        publicClient,
        address,
        deployResult.address,
        hubAddress,
        amount,
        (stage) => setSeedStage(stage === 'approving' ? 'Approving tokens...' : 'Adding liquidity...'),
        ARC_CHAIN_ID,
      );

      if (hash) {
        await publicClient.waitForTransactionReceipt({ hash });
        patchLocalActivityItem(activity.id, { status: 'success', hash });
        toast.custom(() => <TxToast hash={hash} title="Liquidity seeded!" />, { duration: 6000 });
      }
    } catch (err) {
      if (isUserCancellation(err)) {
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: 'Cancelled' });
      } else {
        const parsed = parseContractError(err);
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: parsed.message });
        toast.error(parsed.message);
      }
    } finally {
      setSeeding(false);
      setSeedStage(null);
    }
  }

  async function handleMintMore() {
    if (!walletClient || !publicClient || !deployResult) return;
    setMinting(true);

    try {
      const dec = parseInt(decimals) || 18;
      const amount = parseUnits(mintAmount, dec);
      const to = (mintTo || address) as `0x${string}`;

      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: deployResult.address,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [to, amount],
        account: address as `0x${string}`,
        chain: null,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      toast.custom(() => <TxToast hash={hash} title={`Minted ${mintAmount} ${symbol.toUpperCase()}`} />, { duration: 6000 });
      setMintAmount('');
    } catch (err) {
      if (!isUserCancellation(err)) {
        toast.error(parseContractError(err).message);
      }
    } finally {
      setMinting(false);
    }
  }

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-2 md:pt-6">
        <div className="w-full max-w-[520px] space-y-4">
          {/* Deploy Form */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Deploy Token / Memecoin</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">Create an ERC20 token on Arc Testnet</p>
            </div>

            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Token Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Awesome Token"
                  disabled={!!deployResult}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. MAT"
                    disabled={!!deployResult}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Decimals</label>
                  <input
                    type="number"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    min="0"
                    max="18"
                    disabled={!!deployResult}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Initial Supply</label>
                <input
                  type="text"
                  value={initialSupply}
                  onChange={(e) => setInitialSupply(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="e.g. 1000000"
                  disabled={!!deployResult}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>

              {!deployResult && (
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={!canDeploy || !address}
                  className="w-full rounded-[10px] bg-primary py-[11px] text-[13px] font-bold text-[#0f172a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deploying ? 'Deploying...' : !address ? 'Connect Wallet' : 'Deploy Token'}
                </button>
              )}
            </div>
          </div>

          {/* Post-Deploy Management */}
          {deployResult && (
            <>
              {/* Contract Info */}
              <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
                <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                  <p className="text-[14px] font-bold text-emerald-400">
                    <span className="material-symbols-outlined mr-1 align-middle text-[16px]">check_circle</span>
                    Token Deployed!
                  </p>
                </div>
                <div className="space-y-2 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Contract</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-slate-300">
                        {deployResult.address.slice(0, 8)}...{deployResult.address.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(deployResult.address); toast.success('Address copied'); }}
                        className="text-slate-500 hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      </button>
                      <a
                        href={`${explorerBase}/address/${deployResult.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Name</span>
                    <span className="text-[12px] text-slate-300">{name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Symbol</span>
                    <span className="text-[12px] text-slate-300">{symbol.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Initial Supply</span>
                    <span className="text-[12px] text-slate-300">{Number(initialSupply).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Seed Liquidity */}
              <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
                <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                  <p className="text-[14px] font-bold text-slate-100">Seed Liquidity on Hub AMM</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    Add initial liquidity paired with {hubSymbol}
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">
                      Amount of {symbol.toUpperCase()} to add
                    </label>
                    <input
                      type="text"
                      value={seedAmount}
                      onChange={(e) => setSeedAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="e.g. 10000"
                      className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                    />
                  </div>
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
                  <div>
                    <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Recipient (blank = you)</label>
                    <input
                      type="text"
                      value={mintTo}
                      onChange={(e) => setMintTo(e.target.value)}
                      placeholder={address ?? '0x...'}
                      className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Amount</label>
                    <input
                      type="text"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="e.g. 50000"
                      className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                    />
                  </div>
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

              {/* Deploy Another */}
              <button
                type="button"
                onClick={() => { setDeployResult(null); setName(''); setSymbol(''); setDecimals('18'); setInitialSupply(''); setSeedAmount(''); setMintTo(''); setMintAmount(''); }}
                className="w-full rounded-[10px] py-[10px] text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
              >
                Deploy Another Token
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
