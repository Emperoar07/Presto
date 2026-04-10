'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { parseAbi } from 'viem';
import { parseEther, formatEther, isAddress } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { loadNFTArtifact, deployContract, saveDeployment, type DeployResult } from '@/lib/deployUtils';
import { writeContractWithRetry } from '@/lib/txRetry';
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

const NFT_OWNER_ABI = parseAbi([
  'function ownerMint(address to) external',
  'function ownerMintWithURI(address to, string uri) external',
  'function setBaseURI(string baseURI_) external',
  'function withdraw() external',
  'function totalMinted() external view returns (uint256)',
  'function maxSupply() external view returns (uint256)',
  'function mintPrice() external view returns (uint256)',
]);

export default function DeployNFTPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [maxSupply, setMaxSupply] = useState('');
  const [mintPrice, setMintPrice] = useState('');
  const [baseURI, setBaseURI] = useState('');
  const [collectionImage, setCollectionImage] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Post-deploy actions
  const [ownerMintTo, setOwnerMintTo] = useState('');
  const [ownerMinting, setOwnerMinting] = useState(false);
  const [mintNftName, setMintNftName] = useState('');
  const [mintNftDescription, setMintNftDescription] = useState('');
  const [mintNftImage, setMintNftImage] = useState('');
  const [newBaseURI, setNewBaseURI] = useState('');
  const [updatingURI, setUpdatingURI] = useState(false);

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);
  const canDeploy = name.trim() && symbol.trim() && maxSupply.trim() && Number(maxSupply) > 0 && !deploying;

  async function handleDeploy() {
    if (!walletClient || !publicClient || !address) {
      toast.error('Connect your wallet first');
      return;
    }

    setDeploying(true);
    const activity = createLocalActivityItem({
      category: 'deploy',
      title: `Deploy NFT: ${name}`,
      subtitle: `${maxSupply} max supply`,
      status: 'pending',
    });
    upsertLocalActivityHistoryItem(activity);

    try {
      const artifact = await loadNFTArtifact();
      const price = mintPrice ? parseEther(mintPrice) : 0n;

      const result = await deployContract(walletClient, publicClient, {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [name, symbol.toUpperCase(), BigInt(maxSupply), price, baseURI],
      });

      setDeployResult(result);

      saveDeployment({
        address: result.address,
        chainId: ARC_CHAIN_ID,
        type: 'nft',
        name,
        symbol: symbol.toUpperCase(),
        owner: address,
        hash: result.hash,
        createdAt: Date.now(),
        metadata: {
          maxSupply,
          mintPrice: mintPrice || '0',
          baseURI,
          ...(collectionImage.trim() ? { image: collectionImage.trim() } : {}),
        },
      });

      patchLocalActivityItem(activity.id, { status: 'success', hash: result.hash });
      toast.custom(() => <TxToast hash={result.hash} title={`${name} NFT deployed!`} />, { duration: 6000 });
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

  async function handleOwnerMint() {
    if (!walletClient || !publicClient || !deployResult) return;
    setOwnerMinting(true);
    try {
      const to = (ownerMintTo || address) as `0x${string}`;
      const hasMetadata = mintNftName.trim() || mintNftDescription.trim() || mintNftImage.trim();

      let hash: `0x${string}`;
      if (hasMetadata) {
        // Build a data URI with the metadata JSON so it's stored on-chain per token
        const metadata: Record<string, string> = {};
        if (mintNftName.trim()) metadata.name = mintNftName.trim();
        if (mintNftDescription.trim()) metadata.description = mintNftDescription.trim();
        if (mintNftImage.trim()) metadata.image = mintNftImage.trim();
        const tokenURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

        hash = await writeContractWithRetry(walletClient, publicClient, {
          address: deployResult.address,
          abi: NFT_OWNER_ABI,
          functionName: 'ownerMintWithURI',
          args: [to, tokenURI],
          account: address as `0x${string}`,
          chain: null,
        });
      } else {
        hash = await writeContractWithRetry(walletClient, publicClient, {
          address: deployResult.address,
          abi: NFT_OWNER_ABI,
          functionName: 'ownerMint',
          args: [to],
          account: address as `0x${string}`,
          chain: null,
        });
      }
      await publicClient.waitForTransactionReceipt({ hash });
      toast.custom(() => <TxToast hash={hash} title="NFT minted (owner)" />, { duration: 6000 });
      setOwnerMintTo('');
      setMintNftName('');
      setMintNftDescription('');
      setMintNftImage('');
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setOwnerMinting(false);
    }
  }

  async function handleUpdateBaseURI() {
    if (!walletClient || !publicClient || !deployResult) return;
    setUpdatingURI(true);
    try {
      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: deployResult.address,
        abi: NFT_OWNER_ABI,
        functionName: 'setBaseURI',
        args: [newBaseURI],
        account: address as `0x${string}`,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success('Base URI updated');
      setNewBaseURI('');
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setUpdatingURI(false);
    }
  }

  const mintPageUrl = deployResult ? `${typeof window !== 'undefined' ? window.location.origin : ''}/mint/${deployResult.address}` : '';

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-10 md:pt-16">
        <div className="w-full max-w-[520px] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/deploy"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-[#1e293b] px-3 py-2 text-[12px] font-semibold text-slate-300 transition-colors hover:bg-[#263347] hover:text-white"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to deploy
            </Link>
          </div>

          {/* Deploy Form */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Deploy NFT Collection</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">Create an ERC721 NFT on Arc Testnet</p>
            </div>

            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Collection Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cool Cats"
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
                    placeholder="e.g. CATS"
                    disabled={!!deployResult}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Max Supply</label>
                  <input
                    type="text"
                    value={maxSupply}
                    onChange={(e) => setMaxSupply(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 10000"
                    disabled={!!deployResult}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Mint Price (native, 0 = free)</label>
                <input
                  type="text"
                  value={mintPrice}
                  onChange={(e) => setMintPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  disabled={!!deployResult}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Base URI (IPFS or HTTP)</label>
                <input
                  type="text"
                  value={baseURI}
                  onChange={(e) => setBaseURI(e.target.value)}
                  placeholder="ipfs://Qm.../ or https://api.example.com/metadata/"
                  disabled={!!deployResult}
                  className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Collection Image / Logo URL</label>
                <input
                  type="text"
                  value={collectionImage}
                  onChange={(e) => setCollectionImage(e.target.value)}
                  placeholder="https://... or ipfs://..."
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
                  {deploying ? 'Deploying...' : !address ? 'Connect Wallet' : 'Deploy NFT Collection'}
                </button>
              )}
            </div>
          </div>

          {/* Post-Deploy */}
          {deployResult && (
            <>
              {/* Success + Contract Info */}
              <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
                <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                  <p className="text-[14px] font-bold text-emerald-400">
                    <span className="material-symbols-outlined mr-1 align-middle text-[16px]">check_circle</span>
                    NFT Collection Deployed!
                  </p>
                </div>
                <div className="space-y-2 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Contract</span>
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

                  {/* Mint Page Link */}
                  <div className="mt-3 rounded-[10px] border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[11.5px] font-semibold text-primary">Public Mint Page</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{mintPageUrl}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(mintPageUrl); toast.success('Mint page link copied!'); }}
                        className="flex-shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Owner Mint */}
              <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
                <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                  <p className="text-[14px] font-bold text-slate-100">Owner Mint (Free)</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500">Metadata fields are optional — leave blank to use the collection Base URI</p>
                </div>
                <div className="space-y-3 p-5">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Recipient (blank = you)</label>
                    <input
                      type="text"
                      value={ownerMintTo}
                      onChange={(e) => setOwnerMintTo(e.target.value)}
                      placeholder={address ?? '0x...'}
                      className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                    />
                  </div>

                  <div className="rounded-[10px] border border-white/[0.05] bg-[#1a2740] p-3 space-y-2.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Per-Token Metadata (optional)</p>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Name</label>
                      <input
                        type="text"
                        value={mintNftName}
                        onChange={(e) => setMintNftName(e.target.value)}
                        placeholder="e.g. Cool Cat #1"
                        className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Description</label>
                      <textarea
                        value={mintNftDescription}
                        onChange={(e) => setMintNftDescription(e.target.value)}
                        placeholder="A short description for this NFT"
                        rows={2}
                        className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-slate-400">Image URL</label>
                      <input
                        type="text"
                        value={mintNftImage}
                        onChange={(e) => setMintNftImage(e.target.value)}
                        placeholder="ipfs://... or https://..."
                        className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOwnerMint}
                    disabled={ownerMinting}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] py-[11px] text-[13px] font-bold text-slate-100 transition-colors hover:bg-[#2d3f56] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ownerMinting ? 'Minting...' : 'Mint NFT'}
                  </button>
                </div>
              </div>

              {/* Set Base URI */}
              <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
                <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
                  <p className="text-[14px] font-bold text-slate-100">Update Base URI</p>
                </div>
                <div className="space-y-3 p-5">
                  <input
                    type="text"
                    value={newBaseURI}
                    onChange={(e) => setNewBaseURI(e.target.value)}
                    placeholder="ipfs://Qm.../ or https://..."
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateBaseURI}
                    disabled={!newBaseURI.trim() || updatingURI}
                    className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] py-[11px] text-[13px] font-bold text-slate-100 transition-colors hover:bg-[#2d3f56] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {updatingURI ? 'Updating...' : 'Update Base URI'}
                  </button>
                </div>
              </div>

              {/* Deploy Another */}
              <button
                type="button"
                onClick={() => { setDeployResult(null); setName(''); setSymbol(''); setMaxSupply(''); setMintPrice(''); setBaseURI(''); setMintNftName(''); setMintNftDescription(''); setMintNftImage(''); }}
                className="w-full rounded-[10px] py-[10px] text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
              >
                Deploy Another Collection
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
