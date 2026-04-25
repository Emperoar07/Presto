import hre from "hardhat";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
async function main() {
  const provider = hre.ethers.provider;
  const latest = await provider.getBlockNumber();
  console.log("Latest block:", latest);

  let lo = 0, hi = latest;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(HUB_AMM, mid);
    if (code === "0x") {
      lo = mid;
    } else {
      hi = mid;
    }
    process.stdout.write(`  lo=${lo} hi=${hi}\r`);
  }
  console.log(`\nHubAMM deployed at approximately block ${hi}`);
  console.log(`Use fromBlock=${hi} in backfill script`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
