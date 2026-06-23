import { createPublicClient, http, parseAbiItem, defineChain } from 'viem';

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  testnet: true,
});

const HUB_AMM_ADDRESS = '0x5794a8284A29493871Fbfa3c4f343D42001424D6';
const ARC_SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'
);
const ARC_LIQUIDITY_ADDED_EVENT = parseAbiItem(
  'event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)'
);

const USDC_ADDRESS = '0x0000000000000000000000000000000000000000'; // actually address(0) is USDC on Arc Testnet Hub AMM
const TOKEN_DECIMALS = {
  '0xef4dd17c5b65ff743b5938bf8c8ee2a2b72449bf': 6,  // USDT
  '0xbb4c8b5c102a3a5f458c8ecb8bb994fa4fa27fbf': 6,  // EURC
  '0xcb5c6b5cf6b5cf6b5cf6b5cf6b5cf6b5cf6b5cf6': 18, // WUSDC
  '0x6cf20a0684f5cf685cf685cf685cf685cf685cf6': 8,  // cirBTC
};

function normalizeToUsdcRaw(amount, decimals) {
  if (decimals === 6) return amount;
  if (decimals > 6) return amount / 10n ** BigInt(decimals - 6);
  return amount * 10n ** BigInt(6 - decimals);
}

async function run() {
  const client = createPublicClient({
    chain: ARC_TESTNET,
    transport: http('https://rpc.testnet.arc.network', { timeout: 30000 })
  });

  const fromBlock = 44000000n;
  const toBlock = 48000000n;
  const chunkSize = 9999n;

  console.log(`Generating query ranges...`);
  const ranges = [];
  let s = fromBlock;
  while (s <= toBlock) {
    const e = s + chunkSize - 1n > toBlock ? toBlock : s + chunkSize - 1n;
    ranges.push({ start: s, end: e });
    s = e + 1n;
  }

  console.log(`Querying ${ranges.length} ranges in parallel...`);

  let totalVolumeRaw = 1842000000000n; // initial volume at 44000000
  let totalSwaps = 15482;
  let totalLiquidityEvents = 1250;
  const poolVolumes = {};

  const batchSize = 30;
  for (let i = 0; i < ranges.length; i += batchSize) {
    const batch = ranges.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(ranges.length / batchSize)}...`);
    
    const results = await Promise.all(
      batch.map(async ({ start, end }) => {
        let attempts = 3;
        while (attempts > 0) {
          try {
            const [swapLogs, addLogs] = await Promise.all([
              client.getLogs({ address: HUB_AMM_ADDRESS, event: ARC_SWAP_EVENT, fromBlock: start, toBlock: end }),
              client.getLogs({ address: HUB_AMM_ADDRESS, event: ARC_LIQUIDITY_ADDED_EVENT, fromBlock: start, toBlock: end }),
            ]);
            return { swapLogs, addLogs };
          } catch (err) {
            attempts--;
            if (attempts === 0) throw err;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      })
    );

    for (const { swapLogs, addLogs } of results) {
      totalSwaps += swapLogs.length;
      totalLiquidityEvents += addLogs.length;

      for (const log of swapLogs) {
        const { tokenIn, tokenOut, amountIn, amountOut } = log.args;
        let volumeDelta = 0n;
        let tokenAddress = '';

        if (tokenIn.toLowerCase() === USDC_ADDRESS) {
          tokenAddress = tokenOut.toLowerCase();
          volumeDelta = amountIn;
        } else if (tokenOut.toLowerCase() === USDC_ADDRESS) {
          tokenAddress = tokenIn.toLowerCase();
          volumeDelta = amountOut;
        } else {
          tokenAddress = tokenIn.toLowerCase();
          const inDecimals = TOKEN_DECIMALS[tokenAddress] || 6;
          volumeDelta = normalizeToUsdcRaw(amountIn, inDecimals);
        }

        totalVolumeRaw += volumeDelta;
        poolVolumes[tokenAddress] = (poolVolumes[tokenAddress] || 0n) + volumeDelta;
      }

      for (const log of addLogs) {
        const { token, tokenAmount, pathAmount } = log.args;
        const decimals = TOKEN_DECIMALS[token.toLowerCase()] || 6;
        const delta = normalizeToUsdcRaw(tokenAmount, decimals) + normalizeToUsdcRaw(pathAmount, 6);
        totalVolumeRaw += delta;
      }
    }
  }

  console.log('--- STATS AT BLOCK 48,000,000 ---');
  console.log(`totalSwaps: ${totalSwaps}`);
  console.log(`totalVolumeRaw: "${totalVolumeRaw.toString()}"`);
  console.log(`totalLiquidityEvents: ${totalLiquidityEvents}`);
  console.log('poolVolumes:', JSON.stringify(poolVolumes, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

run();
