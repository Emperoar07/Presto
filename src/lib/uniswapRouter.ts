import { type SynRouteTransaction } from './synroute';
import { getUniswapV2Addresses } from '@/config/contracts';

export type UniswapQuoteRequest = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  tradeType?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  recipient?: string;
  slippageBps?: number;
};

export type UniswapQuoteResponse = {
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  transaction: SynRouteTransaction | null;
  /** Router + path for client-side execution (V2 swapExactTokensForTokens). */
  router?: `0x${string}`;
  path?: `0x${string}`[];
  pair?: `0x${string}`;
  gasEstimate?: string;
  routeString?: string;
};

export async function getUniswapQuote(request: UniswapQuoteRequest): Promise<UniswapQuoteResponse> {
  const response = await fetch('/api/uniswap/quote', {
    method: 'POST',
    headers: { 
      'content-type': 'application/json',
      'x-token-in-decimals': request.tokenInDecimals.toString(),
      'x-token-out-decimals': request.tokenOutDecimals.toString(),
    },
    body: JSON.stringify({
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amount: request.amount,
      tradeType: request.tradeType ?? 'EXACT_INPUT',
      recipient: request.recipient,
      slippageBps: request.slippageBps,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : `Uniswap Quote failed (${response.status})`;
    throw new Error(message);
  }

  return data as UniswapQuoteResponse;
}

export function isUniswapSupportedChain(chainId: number): boolean {
  // Supported when a Uniswap V2 fork is configured for the chain.
  return getUniswapV2Addresses(chainId) !== null;
}
