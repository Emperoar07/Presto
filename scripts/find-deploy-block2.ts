import hre from "hardhat";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
async function main() {
  const p = hre.ethers.provider;
  const latest = await p.getBlockNumber();
  // Check in 5M increments from recent
  for (const offset of [35000000, 34000000, 33000000, 30000000, 25000000, 20000000, 15000000, 10000000, 5000000]) {
    const b = latest - offset;
    if (b < 0) continue;
    try {
      const c = await p.getCode(HUB_AMM, b);
      console.log(`Block ${b} (latest-${offset/1e6}M): ${c !== "0x" ? "EXISTS" : "NOT FOUND"}`);
    } catch(e: any) {
      console.log(`Block ${b}: ERROR ${e.message?.slice(0,80)}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
