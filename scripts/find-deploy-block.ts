import hre from "hardhat";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
async function main() {
  const provider = hre.ethers.provider;
  const latest = await provider.getBlockNumber();
  // Binary search for deployment block - check code existence
  let lo = 0; let hi = latest;
  // First check a recent window - contract is likely deployed in last 2M blocks
  const checkBlock = latest - 2000000;
  const code = await provider.getCode(HUB_AMM, checkBlock);
  if (code !== "0x") {
    console.log("Contract existed at block", checkBlock, "- searching earlier...");
    hi = checkBlock;
  } else {
    console.log("Contract NOT at block", checkBlock, "- searching later...");
    lo = checkBlock;
  }
  // Check a few more recent windows  
  for (const offset of [500000, 1000000, 1500000, 100000, 50000]) {
    const b = latest - offset;
    if (b <= lo || b >= hi) continue;
    const c = await provider.getCode(HUB_AMM, b);
    if (c !== "0x") { hi = b; } else { lo = b; }
    console.log(`Block ${b}: ${c !== "0x" ? "EXISTS" : "NOT FOUND"} (lo=${lo} hi=${hi})`);
  }
  console.log("\nContract deployed between blocks", lo, "and", hi);
  console.log("Safe start block:", lo);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
