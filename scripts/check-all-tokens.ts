import hre from "hardhat";

const DEPLOYER_ADDR = "0x659eEAF9Be1fB881959D883385D03B0Ef5D778E0";

const TOKENS = [
  { name: "USDC",  addr: "0x3600000000000000000000000000000000000000", dec: 6 },
  { name: "EURC",  addr: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", dec: 6 },
  { name: "USDT",  addr: "0x175CdB1D338945f0D851A741ccF787D343E57952", dec: 18 },
  { name: "WUSDC", addr: "0x911b4000D3422F482F4062a913885f7b035382Df", dec: 18 },
  { name: "USYC",  addr: "0x825Ae482558415310C71B7E03d2BbBe409345903", dec: 6 },
];

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function mint(address,uint256) external",
  "function totalSupply() view returns (uint256)",
];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("");

  for (const t of TOKENS) {
    const c = await ethers.getContractAt(ABI, t.addr);
    const bal = await c.balanceOf(deployer.address);
    console.log(`${t.name} (${t.addr})`);
    console.log(`  Balance: ${ethers.formatUnits(bal, t.dec)}`);
    try {
      const owner = await c.owner();
      console.log(`  Owner: ${owner}`);
      console.log(`  We are owner: ${owner.toLowerCase() === deployer.address.toLowerCase()}`);
    } catch {
      console.log(`  Owner: N/A (no owner function)`);
    }
    try {
      const ts = await c.totalSupply();
      console.log(`  TotalSupply: ${ethers.formatUnits(ts, t.dec)}`);
    } catch {
      console.log(`  TotalSupply: N/A`);
    }
    console.log("");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
