import hre from "hardhat";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
async function main() {
  const p = hre.ethers.provider;
  for (let b = 32000000; b <= 33000000; b += 100000) {
    try {
      const c = await p.getCode(HUB_AMM, b);
      console.log(`Block ${b}: ${c !== "0x" ? "EXISTS" : "NOT"}`);
      if (c !== "0x") {
        // Narrow down in 10k increments
        for (let b2 = b - 100000; b2 < b; b2 += 10000) {
          try {
            const c2 = await p.getCode(HUB_AMM, b2);
            console.log(`  Block ${b2}: ${c2 !== "0x" ? "EXISTS" : "NOT"}`);
            if (c2 !== "0x") {
              console.log(`\nContract deployed around block ${b2 - 10000} to ${b2}`);
              return;
            }
          } catch { console.log(`  Block ${b2}: pruned`); }
        }
        return;
      }
    } catch { console.log(`Block ${b}: pruned`); }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
