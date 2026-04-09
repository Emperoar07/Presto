'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import type { Abi } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { deployContract, saveDeployment, loadTokenArtifact, loadNFTArtifact, type DeployResult } from '@/lib/deployUtils';
import { parseContractError, isUserCancellation } from '@/lib/errorHandling';
import { getExplorerBaseUrl } from '@/lib/explorer';
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

type Template = {
  label: string;
  loader: () => Promise<{ abi: Abi; bytecode: `0x${string}` }>;
  description: string;
  buildArgs: () => unknown[];
};

const PRESTO_NAMES = ['Presto', 'Arc', 'Cyan', 'Nova', 'Orbit', 'Luma', 'Signal', 'Echo'];
const TOKEN_SUFFIXES = ['Token', 'Coin', 'Credit', 'Pulse', 'Flow', 'Mint'];
const NFT_SUFFIXES = ['Pass', 'Badge', 'Series', 'Collectible', 'Edition', 'Gallery'];
const SYMBOLS = ['PRST', 'ARC', 'CYN', 'NOVA', 'ORBT', 'LUMA', 'SIG', 'ECHO'];
const TOKEN_SUPPLIES = ['1000000', '2500000', '5000000', '10000000', '25000000'];
const NFT_SUPPLIES = [100, 250, 500, 1000, 2500];
const NFT_PRICES = ['0', '1000000000000000', '2500000000000000', '5000000000000000'];
const TOKEN_BASE_URI = 'https://example.com/metadata/';

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomTokenArgs(): unknown[] {
  const name = `${pick(PRESTO_NAMES)} ${pick(TOKEN_SUFFIXES)}`;
  const symbol = pick(SYMBOLS);
  const supply = pick(TOKEN_SUPPLIES);
  return [name, symbol, 18, supply];
}

function randomNFTArgs(): unknown[] {
  const name = `${pick(PRESTO_NAMES)} ${pick(NFT_SUFFIXES)}`;
  const symbol = `${pick(SYMBOLS)}NFT`;
  const maxSupply = pick(NFT_SUPPLIES);
  const mintPrice = pick(NFT_PRICES);
  const baseURI = `${TOKEN_BASE_URI}${name.toLowerCase().replace(/\s+/g, '-')}/`;
  return [name, symbol, maxSupply, mintPrice, baseURI];
}

const TEMPLATES: Template[] = [
  {
    label: 'ERC20 Token (DeployableToken)',
    description: 'Loads a ready-to-deploy token example.',
    loader: loadTokenArtifact,
    buildArgs: () => ['Presto Token', 'PRST', 18, '1000000000000000000000000'],
  },
  {
    label: 'NFT Collection (DeployableNFT)',
    description: 'Loads a ready-to-deploy NFT collection example.',
    loader: loadNFTArtifact,
    buildArgs: () => ['Presto Collection', 'PRSTNFT', 1000, '0', 'https://example.com/metadata/'],
  },
];

const SURPRISE_TEMPLATES: Template[] = [
  {
    label: 'Random Token Sample',
    description: 'Creates a fresh token template with generated name and supply.',
    loader: loadTokenArtifact,
    buildArgs: randomTokenArgs,
  },
  {
    label: 'Random NFT Sample',
    description: 'Creates a fresh NFT collection template with generated metadata.',
    loader: loadNFTArtifact,
    buildArgs: randomNFTArgs,
  },
];

export default function DeployContractPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [abiText, setAbiText] = useState('');
  const [bytecodeText, setBytecodeText] = useState('');
  const [argsText, setArgsText] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);

  let parsedAbi: Abi | null = null;
  try {
    if (abiText.trim()) parsedAbi = JSON.parse(abiText) as Abi;
  } catch {
    parsedAbi = null;
  }

  const validBytecode = bytecodeText.trim().startsWith('0x') && bytecodeText.trim().length > 10;
  const canDeploy = parsedAbi && validBytecode && !deploying;

  async function loadTemplate(template: Template) {
    setLoadingTemplate(true);
    try {
      const { abi, bytecode } = await template.loader();
      setAbiText(JSON.stringify(abi, null, 2));
      setBytecodeText(bytecode);
      setArgsText(JSON.stringify(template.buildArgs(), null, 2));
      toast.success(`${template.label} loaded`);
    } catch {
      toast.error('Failed to load template');
    }
    setLoadingTemplate(false);
  }

  async function loadRandomTemplate() {
    const pool = [...TEMPLATES, ...SURPRISE_TEMPLATES];
    const template = pool[Math.floor(Math.random() * pool.length)];
    await loadTemplate(template);
  }

  async function handleDeploy() {
    if (!walletClient || !publicClient || !address || !parsedAbi || !validBytecode) return;

    setDeploying(true);
    const activity = createLocalActivityItem({
      category: 'deploy',
      title: 'Deploy Contract',
      subtitle: 'Custom smart contract',
      status: 'pending',
    });
    upsertLocalActivityHistoryItem(activity);

    try {
      const constructorInputs = parsedAbi.find((item) => item.type === 'constructor')?.inputs ?? [];
      let args: unknown[] = [];

      if (constructorInputs.length > 0) {
        if (!argsText.trim()) {
          toast.error(`This contract needs ${constructorInputs.length} constructor argument${constructorInputs.length === 1 ? '' : 's'}`);
          return;
        }

        const parsedArgs = JSON.parse(argsText);
        args = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];

        if (args.length !== constructorInputs.length) {
          toast.error(
            `Expected ${constructorInputs.length} constructor argument${constructorInputs.length === 1 ? '' : 's'}, got ${args.length}`,
          );
          return;
        }
      } else if (argsText.trim()) {
        const parsedArgs = JSON.parse(argsText);
        args = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];
      }

      const result = await deployContract(walletClient, publicClient, {
        abi: parsedAbi,
        bytecode: bytecodeText.trim() as `0x${string}`,
        args,
      });

      setDeployResult(result);

      saveDeployment({
        address: result.address,
        chainId: ARC_CHAIN_ID,
        type: 'contract',
        name: 'Custom Contract',
        owner: address,
        hash: result.hash,
        createdAt: Date.now(),
      });

      patchLocalActivityItem(activity.id, { status: 'success', hash: result.hash });
      toast.custom(() => <TxToast hash={result.hash} title="Contract deployed!" />, { duration: 6000 });
    } catch (err) {
      if (isUserCancellation(err)) {
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: 'Cancelled' });
        toast.error('Deploy cancelled');
      } else if (err instanceof SyntaxError) {
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: 'Constructor args must be valid JSON' });
        toast.error('Constructor args must be valid JSON');
      } else {
        const parsed = parseContractError(err);
        patchLocalActivityItem(activity.id, { status: 'error', errorMessage: parsed.message });
        toast.error(parsed.message);
      }
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-2 md:pt-6">
        <div className="w-full max-w-[600px] space-y-4">
          {/* Header */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Deploy Smart Contract</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">Deploy any contract from ABI + bytecode on Arc Testnet</p>
            </div>

            <div className="space-y-4 p-5">
              {/* Templates */}
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-400">Load Template</label>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => loadTemplate(t)}
                      disabled={loadingTemplate || !!deployResult}
                      className="rounded-[8px] border border-white/[0.07] bg-[#263347] px-3 py-1.5 text-[12px] font-medium text-slate-300 transition-colors hover:bg-[#2d3f56] disabled:opacity-40"
                    >
                      {t.label}
                    </button>
                  ))}
                  {SURPRISE_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => loadTemplate(t)}
                      disabled={loadingTemplate || !!deployResult}
                      className="rounded-[8px] border border-primary/30 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
                      title={t.description}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={loadRandomTemplate}
                    disabled={loadingTemplate || !!deployResult}
                    className="rounded-[8px] border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/15 disabled:opacity-40"
                    title="Load a random token or NFT example"
                  >
                    Surprise me
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Each preset seeds valid constructor arguments, and Surprise me picks a fresh example each time.
                </p>
              </div>

              {/* ABI */}
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">
                  ABI (JSON)
                  {abiText && !parsedAbi && <span className="ml-2 text-rose-400">Invalid JSON</span>}
                </label>
                <textarea
                  value={abiText}
                  onChange={(e) => setAbiText(e.target.value)}
                  placeholder='[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}...]'
                  disabled={!!deployResult}
                  rows={6}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 font-mono text-[12px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>

              {/* Bytecode */}
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">
                  Bytecode (0x...)
                  {bytecodeText && !validBytecode && <span className="ml-2 text-rose-400">Must start with 0x</span>}
                </label>
                <textarea
                  value={bytecodeText}
                  onChange={(e) => setBytecodeText(e.target.value)}
                  placeholder="0x6080604052..."
                  disabled={!!deployResult}
                  rows={4}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 font-mono text-[12px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>

              {/* Constructor Args */}
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">
                  Constructor Arguments (JSON array, optional)
                </label>
                <textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder='["My Token", "MTK", 18, "1000000000000000000000"]'
                  disabled={!!deployResult}
                  rows={2}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 font-mono text-[12px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>

              {!deployResult && (
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={!canDeploy || !address}
                  className="w-full rounded-[10px] bg-primary py-[11px] text-[13px] font-bold text-[#0f172a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deploying ? 'Deploying...' : !address ? 'Connect Wallet' : 'Deploy Contract'}
                </button>
              )}
            </div>
          </div>

          {/* Post-Deploy */}
          {deployResult && (
            <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
              <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                <p className="text-[14px] font-bold text-emerald-400">
                  <span className="material-symbols-outlined mr-1 align-middle text-[16px]">check_circle</span>
                  Contract Deployed!
                </p>
              </div>
              <div className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-slate-500">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-slate-300">
                      {deployResult.address.slice(0, 8)}...{deployResult.address.slice(-6)}
                    </span>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(deployResult.address); toast.success('Copied'); }} className="text-slate-500 hover:text-primary">
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                    <a href={`${explorerBase}/address/${deployResult.address}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary">
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-slate-500">Tx Hash</span>
                  <a href={`${explorerBase}/tx/${deployResult.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-primary hover:underline">
                    {deployResult.hash.slice(0, 10)}...{deployResult.hash.slice(-6)}
                  </a>
                </div>
              </div>
              <div className="p-5 pt-0">
                <button
                  type="button"
                  onClick={() => { setDeployResult(null); setAbiText(''); setBytecodeText(''); setArgsText(''); }}
                  className="w-full rounded-[10px] py-[10px] text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
                >
                  Deploy Another Contract
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
