import { type SynRouteQuote, type SynRouteTransaction } from './synroute';

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
  // Currently only Arc Testnet is supported for Uniswap routing in this integration
  return chainId === 5042002;
}
