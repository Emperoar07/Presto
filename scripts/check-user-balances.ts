import hre from "hardhat";

const USER = "0x117938e180481F0d1C022354B95429872454bB69";

const TOKENS = [
  { name: "USDC",  addr: "0x3600000000000000000000000000000000000000", dec: 6 },
  { name: "EURC",  addr: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", dec: 6 },
  { name: "USDT",  addr: "0x175CdB1D338945f0D851A741ccF787D343E57952", dec: 18 },
  { name: "WUSDC", addr: "0x911b4000D3422F482F4062a913885f7b035382Df", dec: 18 },
  { name: "USYC",  addr: "0x825Ae482558415310C71B7E03d2BbBe409345903", dec: 6 },
];

const ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  const { ethers } = hre;
  console.log("User wallet:", USER, "\n");
  for (const t of TOKENS) {
    const c = await ethers.getContractAt(ABI, t.addr);
    const bal = await c.balanceOf(USER);
    console.log(`${t.name}: ${ethers.formatUnits(bal, t.dec)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
