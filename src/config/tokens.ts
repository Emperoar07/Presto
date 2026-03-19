import { hardhat, baseSepolia } from 'wagmi/chains';

const DEFAULT_CHAIN_ID = 5042002;

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
  [42431]: [ // Tempo Testnet
    { id: "path", symbol: "pathUSD", name: "Path USD", address: "0x20c0000000000000000000000000000000000000", decimals: 6, image: "/icons/path.png" },
    { id: "alpha", symbol: "AlphaUSD", name: "Alpha USD", address: "0x20c0000000000000000000000000000000000001", decimals: 6, image: "/icons/alpha.png", quoteTokenId: "path" },
    { id: "beta", symbol: "BetaUSD", name: "Beta USD", address: "0x20c0000000000000000000000000000000000002", decimals: 6, image: "/icons/beta.png", quoteTokenId: "path" },
    { id: "theta", symbol: "ThetaUSD", name: "Theta USD", address: "0x20c0000000000000000000000000000000000003", decimals: 6, image: "/icons/theta.png", quoteTokenId: "path" }
  ],
  [5042002]: [ // Arc Testnet
    { id: "usdc", symbol: "USDC", name: "USD Coin", address: "0x3600000000000000000000000000000000000000", decimals: 6, image: "/icons/usdc.png" },
    { id: "eurc", symbol: "EURC", name: "Euro Coin", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, image: "/icons/eurc.png", quoteTokenId: "usdc" },
    { id: "usdt", symbol: "USDT", name: "Tether USD", address: "0x175CdB1D338945f0D851A741ccF787D343E57952", decimals: 18, quoteTokenId: "usdc" },
    { id: "wusdc", symbol: "WUSDC", name: "Wrapped USDC", address: "0x911b4000D3422F482F4062a913885f7b035382Df", decimals: 18, quoteTokenId: "usdc" }
  ]
};

const tokenCache = new Map<number, Token[]>();

export const getTokens = (chainId?: number) => {
  const id = chainId || DEFAULT_CHAIN_ID;
  const cached = tokenCache.get(id);
  if (cached) return cached;

  const tokens = CHAIN_TOKENS[id] || CHAIN_TOKENS[DEFAULT_CHAIN_ID];
  tokenCache.set(id, tokens);
  return tokens;
};

/**
 * Get the hub (quote) token for a chain.
 * Tempo uses pathUSD; Arc uses USDC. The hub token is the one without a quoteTokenId.
 */
export const getHubToken = (chainId?: number): Token | undefined => {
  const tokens = getTokens(chainId);
  return tokens.find(t => !t.quoteTokenId);
};

/**
 * Check whether a token is the hub token for its chain.
 */
export const isHubToken = (token: Token, chainId?: number): boolean => {
  const hub = getHubToken(chainId);
  return !!hub && hub.address.toLowerCase() === token.address.toLowerCase();
};
