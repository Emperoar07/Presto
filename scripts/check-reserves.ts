import hre from "hardhat";

const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const TOKENS = [
  { name: "EURC",  addr: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", dec: 6 },
  { name: "USDT",  addr: "0x175CdB1D338945f0D851A741ccF787D343E57952", dec: 18 },
  { name: "WUSDC", addr: "0x911b4000D3422F482F4062a913885f7b035382Df", dec: 18 },
  { name: "USYC",  addr: "0x825Ae482558415310C71B7E03d2BbBe409345903", dec: 6 },
];

const AMM_ABI = [
  "function tokenReserves(address) view returns (uint256)",
  "function pathReserves(address) view returns (uint256)",
  "function totalShares(address) view returns (uint256)",
];

async function main() {
  const { ethers } = hre;
  const amm = await ethers.getContractAt(AMM_ABI, HUB_AMM);

  for (const t of TOKENS) {
    const [tR, pR, shares] = await Promise.all([
      amm.tokenReserves(t.addr),
      amm.pathReserves(t.addr),
      amm.totalShares(t.addr),
    ]);
    const tokenRes = ethers.formatUnits(tR, t.dec);
    const usdcRes = ethers.formatUnits(pR, 6);
    const liqUsd = Number(usdcRes) * 2;
    console.log(`${t.name}:`);
    console.log(`  Token reserve: ${tokenRes}`);
    console.log(`  USDC reserve:  ${usdcRes}`);
    console.log(`  Liquidity:     ~$${liqUsd.toFixed(2)}`);
    console.log(`  Total shares:  ${shares.toString()}\n`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
