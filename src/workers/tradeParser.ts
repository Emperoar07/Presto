import { formatUnits } from 'viem';

type Token = { address: string; decimals: number };
type Trade = {
  hash: string;
  blockNumber: bigint;
  type: 'Buy' | 'Sell';
  amountIn: string;
  amountOut: string;
  price: string;
};

type Payload = {
  logs: Array<{
    transactionHash: string;
    blockNumber: bigint;
    args: {
      amount0In?: bigint;
      amount1In?: bigint;
      amount0Out?: bigint;
      amount1Out?: bigint;
    };
  }>;
  tokenA: Token;
  tokenB: Token;
};

const formatTrades = (payload: Payload): Trade[] => {
  const { logs, tokenA, tokenB } = payload;
  const sorted = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const token0 = sorted ? tokenA : tokenB;
  const token1 = sorted ? tokenB : tokenA;

  return logs.map((log) => {
    const { amount0In, amount1In, amount0Out, amount1Out } = log.args;
    let type: 'Buy' | 'Sell' = 'Buy';
    let amountInVal = 0n;
    let amountOutVal = 0n;

    if (amount0In && amount0In > 0n) {
      type = sorted ? 'Sell' : 'Buy';
      amountInVal = amount0In;
      amountOutVal = amount1Out || 0n;
    } else {
      type = sorted ? 'Buy' : 'Sell';
      amountInVal = amount1In || 0n;
      amountOutVal = amount0Out || 0n;
    }

    const formattedAmountIn = formatUnits(amountInVal, sorted ? token0.decimals : token1.decimals);
    const formattedAmountOut = formatUnits(amountOutVal, sorted ? token1.decimals : token0.decimals);

    const numIn = Number(formattedAmountIn);
    const numOut = Number(formattedAmountOut);

    let displayPrice = '0';
    if (numIn > 0 && numOut > 0) {
      displayPrice = type === 'Buy' ? (numIn / numOut).toFixed(6) : (numOut / numIn).toFixed(6);
    }

    return {
      hash: log.transactionHash,
      blockNumber: log.blockNumber,
      type,
      amountIn: type === 'Buy' ? formatUnits(amountInVal, token1.decimals) : formatUnits(amountInVal, token0.decimals),
      amountOut: type === 'Buy' ? formatUnits(amountOutVal, token0.decimals) : formatUnits(amountOutVal, token1.decimals),
      price: displayPrice,
    };
  });
};

self.onmessage = (event: MessageEvent<Payload>) => {
  const trades = formatTrades(event.data);
  self.postMessage(trades);
};
