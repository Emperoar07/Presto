import { hardhat, baseSepolia } from 'wagmi/chains';

export interface Token {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  image?: string;
  id?: string;
  quoteTokenId?: string;
}

export const CHAIN_TOKENS: Record<number, Token[]> = {
  [hardhat.id]: [
    { id: "path", symbol: "pathUSD", name: "Path USD", address: "0x34887E7672f1f38Ca230Fd73410CdD9e863880F4", decimals: 18, image: "/icons/path.png" },
    { id: "alpha", symbol: "AlphaUSD", name: "Alpha USD", address: "0xB7E5804d11dc0887807A7a9F5699c7a71c26eC05", decimals: 18, image: "/icons/alpha.png", quoteTokenId: "path" },
    { id: "beta", symbol: "BetaUSD", name: "Beta USD", address: "0x012E9CD3f17d0E72f11c23542312eA625a52271D", decimals: 18, image: "/icons/beta.png", quoteTokenId: "path" },
    { id: "theta", symbol: "ThetaUSD", name: "Theta USD", address: "0xe9c1e58BBfc66D856B9f834F60D3d5836bd41372", decimals: 18, image: "/icons/theta.png", quoteTokenId: "path" }
  ],
  [baseSepolia.id]: [
    { symbol: 'ETH', name: 'Ether', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', address: '0x0000000000000000000000000000000000000000', decimals: 6 },
  ],
  [42431]: [ // Tempo Testnet (Moderato)
    { id: "path", symbol: "pathUSD", name: "Path USD", address: "0x20c0000000000000000000000000000000000000", decimals: 6, image: "/icons/path.png" },
    { id: "alpha", symbol: "AlphaUSD", name: "Alpha USD", address: "0x20c0000000000000000000000000000000000001", decimals: 6, image: "/icons/alpha.png", quoteTokenId: "path" },
    { id: "beta", symbol: "BetaUSD", name: "Beta USD", address: "0x20c0000000000000000000000000000000000002", decimals: 6, image: "/icons/beta.png", quoteTokenId: "path" },
    { id: "theta", symbol: "ThetaUSD", name: "Theta USD", address: "0x20c0000000000000000000000000000000000003", decimals: 6, image: "/icons/theta.png", quoteTokenId: "path" }
  ]
};

const tokenCache = new Map<number, Token[]>();

export const getTokens = (chainId?: number) => {
  const id = chainId || hardhat.id;
  const cached = tokenCache.get(id);
  if (cached) return cached;

  const tokens = CHAIN_TOKENS[id] || CHAIN_TOKENS[hardhat.id];
  tokenCache.set(id, tokens);
  return tokens;
};
