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
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4 py-10">
      <div className="w-full max-w-[420px] space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="mb-3 inline-flex size-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(167,139,250,0.12)' }}>
            <span className="material-symbols-outlined text-[28px] text-[#a78bfa]">image</span>
          </div>
          {loading ? (
            <p className="mt-2 text-[13px] text-slate-500">Loading collection...</p>
          ) : error ? (
            <p className="mt-2 text-[13px] text-rose-400">{error}</p>
          ) : info ? (
            <>
              <h1 className="break-words text-[20px] font-bold text-slate-100">{info.name}</h1>
              <p className="text-[13px] text-slate-500">{info.symbol}</p>
            </>
          ) : null}
        </div>

        {info && !error && (
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="space-y-4 p-5">
              {/* Progress */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-slate-400">Minted</span>
                  <span className="font-semibold text-slate-200">
                    {info.totalMinted.toString()} / {info.maxSupply.toString()}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#263347]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#25c0f4] transition-all duration-500"
                    style={{ width: `${Math.min(progressPct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between rounded-[10px] bg-[#263347] px-4 py-3">
                <span className="text-[12px] text-slate-400">Mint Price</span>
                <span className="text-[14px] font-bold text-slate-100">
                  {info.mintPrice === 0n ? 'Free' : `${formatEther(info.mintPrice)} USDC`}
                </span>
              </div>

              {/* Mint Button */}
              {!address ? (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="w-full rounded-[10px] bg-primary py-[12px] text-[14px] font-bold text-[#0f172a] transition-opacity hover:opacity-90"
                    >
                      Connect Wallet to Mint
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : soldOut ? (
                <div className="rounded-[10px] bg-rose-500/10 py-[12px] text-center text-[14px] font-bold text-rose-400">
                  Sold Out
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleMint}
                  disabled={minting}
                  className="w-full rounded-[10px] bg-primary py-[12px] text-[14px] font-bold text-[#0f172a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {minting ? 'Minting...' : 'Mint NFT'}
                </button>
              )}

              {/* Contract link */}
              <div className="text-center">
                <a
                  href={`${explorerBase}/address/${contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-slate-600 hover:text-slate-400"
                >
                  View Contract on Explorer
                  <span className="material-symbols-outlined ml-0.5 align-middle text-[11px]">open_in_new</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Powered by */}
        <div className="text-center">
          <p className="text-[10px] text-slate-600">
            Powered by <span className="font-bold text-primary">Presto DEX</span> on Arc Testnet
          </p>
        </div>
      </div>
    </div>
  );
}
