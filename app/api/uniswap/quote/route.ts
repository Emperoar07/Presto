import { NextResponse } from 'next/server';
import { AlphaRouter, SwapOptionsSwapRouter02, SwapType, SwapRoute } from '@uniswap/smart-order-router';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ethers } from 'ethers';

const BASE_SEPOLIA_CHAIN_ID = 84532;

// In a real app we'd get this from environment
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// Simple cache to avoid instantiating provider repeatedly
let provider: ethers.JsonRpcProvider;
let router: AlphaRouter;

function getRouter() {
  if (!router) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    router = new AlphaRouter({ chainId: BASE_SEPOLIA_CHAIN_ID, provider });
  }
  return router;
}

export async function POST(request: Request) {
  try {
    const { tokenIn, tokenOut, amount, tradeType, recipient, slippageBps } = await request.json();

    if (!tokenIn || !tokenOut || !amount) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Only Base Sepolia supported
    const chainId = BASE_SEPOLIA_CHAIN_ID;
    
    // We only support exactly these addresses for demo purposes, but in reality we'd fetch decimals
    const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'.toLowerCase();
    const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'.toLowerCase(); // Example testnet USDC
    
    // Get decimals - we could fetch this, but for performance we can require the client to send it,
    // or just default to 18 / 6. Let's assume the client sends decimals or we look it up.
    // To make it robust, we should expect decimals from the request
    const tokenInDecimals = request.headers.get('x-token-in-decimals') ? parseInt(request.headers.get('x-token-in-decimals')!) : 18;
    const tokenOutDecimals = request.headers.get('x-token-out-decimals') ? parseInt(request.headers.get('x-token-out-decimals')!) : 18;

    const TokenIn = new Token(chainId, tokenIn, tokenInDecimals);
    const TokenOut = new Token(chainId, tokenOut, tokenOutDecimals);

    const isExactIn = tradeType !== 'EXACT_OUTPUT';
    const type = isExactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT;
    const currencyAmount = isExactIn 
      ? CurrencyAmount.fromRawAmount(TokenIn, amount)
      : CurrencyAmount.fromRawAmount(TokenOut, amount);

    const alphaRouter = getRouter();
    
    // Config for executing the swap
    const slippageTolerance = new Percent(slippageBps || 50, 10000); // Default 0.5%
    
    // Universal Router config
    const options: SwapOptionsSwapRouter02 = recipient ? {
      recipient,
      slippageTolerance,
      deadline: Math.floor(Date.now() / 1000 + 1200), // 20 minutes
      type: SwapType.SWAP_ROUTER_02,
    } : undefined as any;

    const route = await alphaRouter.route(
      currencyAmount,
      isExactIn ? TokenOut : TokenIn,
      type,
      recipient ? options : undefined
    );

    if (!route) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    return NextResponse.json({
      amountIn: route.trade.inputAmount.quotient.toString(),
      amountOut: route.trade.outputAmount.quotient.toString(),
      priceImpact: route.trade.priceImpact.toSignificant(4),
      transaction: route.methodParameters ? {
        to: route.methodParameters.to,
        data: route.methodParameters.calldata,
        value: route.methodParameters.value,
      } : null,
      gasEstimate: route.estimatedGasUsed.toString(),
      routeString: route.route.map(r => r.tokenPath.map(t => t.symbol).join(' -> ')).join(', ')
    });

  } catch (error) {
    console.error('Uniswap Quote Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
