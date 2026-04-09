'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { formatEther, parseAbi } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { writeContractWithRetry } from '@/lib/txRetry';
import { parseContractError, isUserCancellation } from '@/lib/errorHandling';
import { getExplorerBaseUrl } from '@/lib/explorer';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

const NFT_ABI = parseAbi([
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function totalMinted() external view returns (uint256)',
  'function maxSupply() external view returns (uint256)',
  'function mintPrice() external view returns (uint256)',
  'function ownerMint(address to) external',
  'function setBaseURI(string baseURI_) external',
  'function withdraw() external',
]);

export default function ManageNFTPage() {
  const params = useParams();
  const contractAddress = params.address as `0x${string}`;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [info, setInfo] = useState<{ name: string; symbol: string; totalMinted: string; maxSupply: string; mintPrice: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [ownerMintTo, setOwnerMintTo] = useState('');
  const [ownerMinting, setOwnerMinting] = useState(false);
  const [newBaseURI, setNewBaseURI] = useState('');
  const [updatingURI, setUpdatingURI] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);
  const mintPageUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/mint/${contractAddress}`;

  useEffect(() => {
    async function load() {
      if (!publicClient) { setLoading(false); return; }
      try {
        const [name, symbol, totalMinted, maxSupply, mintPrice] = await Promise.all([
          publicClient.readContract({ address: contractAddress, abi: NFT_ABI, functionName: 'name' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_ABI, functionName: 'totalMinted' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_ABI, functionName: 'maxSupply' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_ABI, functionName: 'mintPrice' }),
        ]);
        setInfo({
          name,
          symbol,
          totalMinted: totalMinted.toString(),
          maxSupply: maxSupply.toString(),
          mintPrice: formatEther(mintPrice),
        });
      } catch {
        setInfo(null);
      }
      setLoading(false);
    }
    load();
  }, [publicClient, contractAddress]);

  async function handleOwnerMint() {
    if (!walletClient || !publicClient) return;
    setOwnerMinting(true);
    try {
      const to = (ownerMintTo || address) as `0x${string}`;
      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: contractAddress, abi: NFT_ABI, functionName: 'ownerMint', args: [to],
        account: address as `0x${string}`, chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.custom(() => <TxToast hash={hash} title="NFT minted" />, { duration: 6000 });
      setOwnerMintTo('');
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setOwnerMinting(false);
    }
  }

  async function handleUpdateBaseURI() {
    if (!walletClient || !publicClient) return;
    setUpdatingURI(true);
    try {
      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: contractAddress, abi: NFT_ABI, functionName: 'setBaseURI', args: [newBaseURI],
        account: address as `0x${string}`, chain: null,
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

  async function handleWithdraw() {
    if (!walletClient || !publicClient) return;
    setWithdrawing(true);
    try {
      const hash = await writeContractWithRetry(walletClient, publicClient, {
        address: contractAddress, abi: NFT_ABI, functionName: 'withdraw', args: [],
        account: address as `0x${string}`, chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success('Funds withdrawn');
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
        <div className="flex items-start justify-center pt-10">
          <p className="text-[13px] text-slate-500">Loading NFT info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-2 md:pt-6">
        <div className="w-full max-w-[520px] space-y-4">
          {/* Collection Info */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Manage {info?.name ?? 'NFT'}</p>
            </div>
            <div className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Contract</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-slate-300">{contractAddress.slice(0, 8)}...{contractAddress.slice(-6)}</span>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(contractAddress); toast.success('Copied'); }} className="text-slate-500 hover:text-primary">
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  </button>
                  <a href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </div>
              </div>
              {info && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Minted</span>
                    <span className="text-[12px] text-slate-300">{info.totalMinted} / {info.maxSupply}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">Mint Price</span>
                    <span className="text-[12px] text-slate-300">{info.mintPrice === '0' ? 'Free' : `${info.mintPrice} native`}</span>
                  </div>
                </>
              )}
              {/* Mint Page Link */}
              <div className="mt-2 rounded-[10px] border border-primary/20 bg-primary/5 p-3">
                <p className="text-[11.5px] font-semibold text-primary">Public Mint Page</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{mintPageUrl}</span>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(mintPageUrl); toast.success('Link copied!'); }}
                    className="flex-shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Owner Mint */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Owner Mint (Free)</p>
            </div>
            <div className="space-y-3 p-5">
              <input type="text" value={ownerMintTo} onChange={(e) => setOwnerMintTo(e.target.value)}
                placeholder={address ?? '0x... recipient'} className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40" />
              <button type="button" onClick={handleOwnerMint} disabled={ownerMinting}
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] py-[11px] text-[13px] font-bold text-slate-100 transition-colors hover:bg-[#2d3f56] disabled:cursor-not-allowed disabled:opacity-40">
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
              <input type="text" value={newBaseURI} onChange={(e) => setNewBaseURI(e.target.value)}
                placeholder="ipfs://Qm.../ or https://..." className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] px-3 py-2.5 text-[13px] text-slate-100 placeholder-slate-600 outline-none focus:border-primary/40" />
              <button type="button" onClick={handleUpdateBaseURI} disabled={!newBaseURI.trim() || updatingURI}
                className="w-full rounded-[10px] border border-white/[0.07] bg-[#263347] py-[11px] text-[13px] font-bold text-slate-100 transition-colors hover:bg-[#2d3f56] disabled:cursor-not-allowed disabled:opacity-40">
                {updatingURI ? 'Updating...' : 'Update URI'}
              </button>
            </div>
          </div>

          {/* Withdraw */}
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">Withdraw Mint Revenue</p>
            </div>
            <div className="p-5">
              <button type="button" onClick={handleWithdraw} disabled={withdrawing}
                className="w-full rounded-[10px] bg-emerald-600 py-[11px] text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {withdrawing ? 'Withdrawing...' : 'Withdraw Funds'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
