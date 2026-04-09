import hre from "hardhat";

const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";

async function main() {
  const { ethers } = hre;
  const provider = ethers.provider;
  const latestBlock = await provider.getBlockNumber();

  const amm = new ethers.Contract(HUB_AMM, [
    "event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
    "event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares)",
  ], provider);

  console.log("Latest block:", latestBlock);
  console.log("Scanning from block 0...\n");

  // Contract deployed recently, scan last 500k blocks
  const startBlock = Math.max(0, latestBlock - 500000);
  const CHUNK = 9999;
  let swapEvents: any[] = [];
  let addEvents: any[] = [];

  for (let from = startBlock; from <= latestBlock; from += CHUNK + 1) {
    const to = Math.min(from + CHUNK, latestBlock);
    const [swaps, adds] = await Promise.all([
      amm.queryFilter(amm.filters.Swap(), from, to),
      amm.queryFilter(amm.filters.LiquidityAdded(), from, to),
    ]);
    swapEvents.push(...swaps);
    addEvents.push(...adds);
  }

  console.log(`Found ${swapEvents.length} Swap events`);
  console.log(`Found ${addEvents.length} LiquidityAdded events\n`);

  // Calculate swap volume (USDC side)
  const USDC = "0x3600000000000000000000000000000000000000".toLowerCase();
  let swapVolume = 0n;
  for (const e of swapEvents) {
    const tokenIn = e.args[1].toLowerCase();
    const tokenOut = e.args[2].toLowerCase();
    const amountIn = e.args[3];
    const amountOut = e.args[4];
    if (tokenIn === USDC) swapVolume += amountIn;
    else if (tokenOut === USDC) swapVolume += amountOut;
  }

  // Calculate liquidity volume (pathAmount = USDC deposited)
  let liqVolume = 0n;
  const providers = new Set<string>();
  for (const e of addEvents) {
    const prov = e.args[0].toLowerCase();
    const pathAmount = e.args[3]; // pathAmount is 4th arg (index 3)
    providers.add(prov);
    liqVolume += pathAmount;
    console.log(`  LiqAdd: provider=${prov.slice(0,10)}... token=${e.args[1].slice(0,10)}... pathAmt=${ethers.formatUnits(pathAmount, 6)} USDC`);
  }

  // Unique traders from swaps
  const traders = new Set<string>();
  for (const e of swapEvents) {
    traders.add(e.args[0].toLowerCase());
  }
  for (const p of providers) traders.add(p);

  const totalVolume = swapVolume + liqVolume;

  console.log("\n========================================");
  console.log("Swap volume:      ", ethers.formatUnits(swapVolume, 6), "USDC");
  console.log("Liquidity volume: ", ethers.formatUnits(liqVolume, 6), "USDC");
  console.log("Total volume:     ", ethers.formatUnits(totalVolume, 6), "USDC");
  console.log("Total swaps:      ", swapEvents.length);
  console.log("Total liq adds:   ", addEvents.length);
  console.log("Unique traders:   ", traders.size);
  console.log("========================================");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
