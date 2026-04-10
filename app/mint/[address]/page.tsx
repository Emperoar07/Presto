'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { formatEther, isAddress, parseAbi } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { writeContractWithRetry } from '@/lib/txRetry';
import { parseContractError, isUserCancellation } from '@/lib/errorHandling';
import { getExplorerBaseUrl } from '@/lib/explorer';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { loadAllDeployments } from '@/lib/deployUtils';
import { normalizeImageSource } from '@/lib/imageSource';

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

const NFT_READ_ABI = parseAbi([
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function totalMinted() external view returns (uint256)',
  'function maxSupply() external view returns (uint256)',
  'function mintPrice() external view returns (uint256)',
  'function owner() external view returns (address)',
]);

const NFT_MINT_ABI = parseAbi([
  'function mint(address to) external payable',
]);

type CollectionInfo = {
  name: string;
  symbol: string;
  totalMinted: bigint;
  maxSupply: bigint;
  mintPrice: bigint;
  owner: string;
};

export default function MintPage() {
  const params = useParams();
  const rawAddress = params.address as string;
  const contractAddress = rawAddress as `0x${string}`;
  const validAddress = isAddress(rawAddress);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [info, setInfo] = useState<CollectionInfo | null>(null);
  const [collectionImage, setCollectionImage] = useState('');
  const [collectionLabel, setCollectionLabel] = useState('Base preview');
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);

  useEffect(() => {
    async function load() {
      if (!publicClient || !validAddress) {
        if (!validAddress) setError('Invalid contract address.');
        setLoading(false);
        return;
      }
      try {
        const [name, symbol, totalMinted, maxSupply, mintPrice, owner] = await Promise.all([
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'name' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'totalMinted' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'maxSupply' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'mintPrice' }),
          publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'owner' }),
        ]);
        setInfo({ name, symbol, totalMinted, maxSupply, mintPrice, owner });

        const deployments = loadAllDeployments();
        const deployment = deployments.find(
          (item) => item.address.toLowerCase() === contractAddress.toLowerCase() && item.type === 'nft',
        );
        const art = normalizeImageSource(deployment?.metadata?.image?.toString() ?? '');
        setCollectionImage(art);
        setCollectionLabel(deployment?.name || name);
      } catch {
        setError('Could not load NFT collection. Check the contract address.');
      }
      setLoading(false);
    }
    load();
  }, [publicClient, contractAddress]);

  async function handleMint() {
    if (!walletClient || !publicClient || !address || !info) return;
    setMinting(true);
    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: NFT_MINT_ABI,
        functionName: 'mint',
        args: [address],
        value: info.mintPrice,
        account: address as `0x${string}`,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.custom(() => <TxToast hash={hash} title="NFT Minted!" />, { duration: 6000 });

      // Refresh info
      const totalMinted = await publicClient.readContract({ address: contractAddress, abi: NFT_READ_ABI, functionName: 'totalMinted' });
      setInfo((prev) => prev ? { ...prev, totalMinted } : prev);
    } catch (err) {
      if (!isUserCancellation(err)) toast.error(parseContractError(err).message);
    } finally {
      setMinting(false);
    }
  }

  const soldOut = info ? info.totalMinted >= info.maxSupply : false;
  const progressPct = info ? Number((info.totalMinted * 100n) / (info.maxSupply || 1n)) : 0;

  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-5 md:px-7 md:py-7">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Public mint
          </div>
          <div>
            <h1 className="text-[28px] font-black leading-none text-white md:text-[34px]">Mint your NFT</h1>
            <p className="mt-2 max-w-[720px] text-[13px] leading-6 text-slate-500 md:text-[14px]">
              Clean Arc Testnet minting with a live collection preview, a compact mint flow, and optional reveal later.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center rounded-full border border-white/[0.07] bg-[#17233a] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
          Arc Testnet only
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-[18px]" style={{ background: SURF, border: BDR }}>
          <p className="text-[13px] text-slate-500">Loading collection...</p>
        </div>
      ) : error ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-[18px]" style={{ background: SURF, border: BDR }}>
          <p className="text-[13px] text-rose-400">{error}</p>
        </div>
      ) : info ? (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="overflow-hidden rounded-[18px]" style={{ background: SURF, border: BDR }}>
            <div className="border-b border-white/[0.07] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Collection</p>
                  <h2 className="mt-1 break-words text-[24px] font-extrabold text-white md:text-[28px]">{info.name}</h2>
                  <p className="mt-1 text-[13px] font-medium tracking-[0.08em] text-primary">{info.symbol}</p>
                </div>
                <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                  Reveal later
                </div>
              </div>
            </div>

            <div className="p-5 md:p-6">
              <div className="overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#101c31]">
                <div className="aspect-[4/5] w-full">
                  {collectionImage ? (
                    <img
                      src={collectionImage}
                      alt={`${info.name} preview`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#172544] via-[#1c2744] to-[#0f172a]">
                      <div className="text-center">
                        <div className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-[#1e293b]">
                          <span className="material-symbols-outlined text-[30px] text-primary">image</span>
                        </div>
                        <p className="mt-4 text-[14px] font-semibold text-slate-100">Base preview</p>
                        <p className="mt-1 text-[12px] text-slate-500">Reveal later for {collectionLabel}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[14px] border border-white/[0.07] bg-[#17233a] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Minted</p>
                  <p className="mt-2 text-[22px] font-extrabold text-white">
                    {info.totalMinted.toString()} / {info.maxSupply.toString()}
                  </p>
                </div>
                <div className="rounded-[14px] border border-white/[0.07] bg-[#17233a] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mint price</p>
                  <p className="mt-2 text-[22px] font-extrabold text-white">
                    {info.mintPrice === 0n ? 'Free' : `${formatEther(info.mintPrice)} USDC`}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-[18px]" style={{ background: SURF, border: BDR }}>
              <div className="p-5 md:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mint progress</p>
                  <p className="text-[12px] font-semibold text-slate-300">{progressPct.toFixed(0)}%</p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#263347]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-[#4dd8ff] transition-all duration-500"
                    style={{ width: `${Math.min(progressPct, 100)}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[14px] border border-white/[0.07] bg-[#17233a] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Owner</p>
                    <p className="mt-2 truncate text-[13px] font-semibold text-slate-100">{info.owner}</p>
                  </div>
                  <div className="rounded-[14px] border border-white/[0.07] bg-[#17233a] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                    <p className="mt-2 text-[13px] font-semibold text-slate-100">{soldOut ? 'Sold out' : 'Live now'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[18px]" style={{ background: SURF, border: BDR }}>
              <div className="space-y-4 p-5 md:p-6">
                {!address ? (
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        type="button"
                        onClick={openConnectModal}
                        className="w-full rounded-[12px] bg-primary py-[13px] text-[14px] font-bold text-[#0f172a] transition-opacity hover:opacity-90"
                      >
                        Connect wallet to mint
                      </button>
                    )}
                  </ConnectButton.Custom>
                ) : soldOut ? (
                  <div className="rounded-[12px] border border-rose-500/20 bg-rose-500/10 py-[13px] text-center text-[14px] font-bold text-rose-400">
                    Sold out
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleMint}
                    disabled={minting}
                    className="w-full rounded-[12px] bg-primary py-[13px] text-[14px] font-bold text-[#0f172a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {minting ? 'Minting...' : 'Mint NFT'}
                  </button>
                )}

                <div className="rounded-[14px] border border-white/[0.07] bg-[#17233a] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contract</p>
                      <p className="mt-1 font-mono text-[12px] text-slate-300">
                        {contractAddress.slice(0, 8)}...{contractAddress.slice(-6)}
                      </p>
                    </div>
                    <a
                      href={`${explorerBase}/address/${contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-[10px] border border-white/[0.07] bg-[#203049] px-3 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-[#263347] hover:text-white"
                    >
                      Explorer
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
