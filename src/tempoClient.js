import { createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits } from 'viem';

// 1. Define the Tempo Testnet Chain
const tempoTestnet = {
  id: 42431,
  name: 'Tempo Testnet',
  network: 'tempo-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'pathUSD',
    symbol: 'pathUSD',
  },
  rpcUrls: {
    default: { http: ['https://rpc.tempo.xyz'] }, // Ensure this matches official docs
    public: { http: ['https://rpc.tempo.xyz'] },
  },
};

// 2. Constants & Addresses
const DEX_ADDRESS = "0xDEc0000000000000000000000000000000000000";
const FEE_AMM_ADDRESS = "0x4300000000000000000000000000000000000002";

export const TOKENS = {
  pathUSD:  "0x20c0000000000000000000000000000000000000",
  AlphaUSD: "0x20c0000000000000000000000000000000000001",
  BetaUSD:  "0x20c0000000000000000000000000000000000002",
  ThetaUSD: "0x20c0000000000000000000000000000000000003"
};

// 3. ABIs (The instructions for the blockchain)
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }
];

const DEX_ABI = [
  { name: 'sell', type: 'function', inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint128' }, { name: 'minAmountOut', type: 'uint128' }], outputs: [{ name: 'amountOut', type: 'uint128' }] },
  { name: 'place', type: 'function', inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint128' }, { name: 'tick', type: 'int24' }], outputs: [{ name: 'id', type: 'uint64' }] }
];

// 4. Client Setup
export const publicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http()
});

export const getWalletClient = (address) => createWalletClient({
  account: address,
  chain: tempoTestnet,
  transport: custom(window.ethereum)
});

// --- ENGINE FUNCTIONS ---

// Check user balance for a specific token
export const getTokenBalance = async (address, tokenAddress) => {
  if (!address || !tokenAddress) return '0';
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address]
    });
    return formatUnits(balance, 18); // Assuming 18 decimals for all
  } catch (err) {
    console.error("Error fetching balance:", err);
    return '0';
  }
};

// Approve the DEX to spend your tokens
export const approveToken = async (userAddress, tokenAddress, amount) => {
  const client = getWalletClient(userAddress);
  // First check allowance
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress, DEX_ADDRESS]
  });

  if (allowance < parseUnits(amount, 18)) {
    const hash = await client.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [DEX_ADDRESS, parseUnits(amount, 18)]
    });
    return hash; // Return transaction hash
  }
  return null; // Already approved
};

// Execute the Swap (Market Sell)
export const executeSwap = async (userAddress, tokenIn, tokenOut, amountIn) => {
  const client = getWalletClient(userAddress);
  const amountBig = parseUnits(amountIn, 18);

  // 1. Approve first
  await approveToken(userAddress, tokenIn, amountIn);

  // 2. Execute Swap
  return await client.writeContract({
    address: DEX_ADDRESS,
    abi: DEX_ABI,
    functionName: 'sell',
    args: [tokenIn, tokenOut, amountBig, 0], // 0 = accept any slippage for testnet
    account: userAddress
  });
};

// Provide Liquidity (Limit Order)
export const provideLiquidity = async (userAddress, tokenIn, tokenOut, amountIn, tick) => {
  const client = getWalletClient(userAddress);
  const amountBig = parseUnits(amountIn, 18);

  // 1. Approve first
  await approveToken(userAddress, tokenIn, amountIn);

  // 2. Place Order
  return await client.writeContract({
    address: DEX_ADDRESS,
    abi: DEX_ABI,
    functionName: 'place',
    args: [tokenIn, tokenOut, amountBig, parseInt(tick)], 
    account: userAddress
  });
};
