import hre from "hardhat";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
async function main() {
  const p = hre.ethers.provider;
  for (const b of [21000000, 22000000, 23000000, 24000000, 25000000, 26000000, 27000000, 28000000, 29000000, 30000000, 31000000, 32000000, 33000000, 34000000, 35000000]) {
    try {
      const c = await p.getCode(HUB_AMM, b);
      console.log(`Block ${b}: ${c !== "0x" ? "EXISTS" : "NOT FOUND"}`);
    } catch(e: any) {
      console.log(`Block ${b}: ERROR (pruned)`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
