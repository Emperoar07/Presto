import hre from "hardhat";

const USYC = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const DEPLOYER = "0x659eEAF9Be1fB881959D883385D03B0Ef5D778E0";

const MINT_ABIS = [
  "function mint(address to, uint256 amount) external",
  "function mint(uint256 amount) external",
  "function owner() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function balanceOf(address) external view returns (uint256)",
];

async function main() {
  const { ethers } = hre;
  const usyc = await ethers.getContractAt(MINT_ABIS, USYC);

  try { console.log("name:", await usyc.name()); } catch(e: any) { console.log("name: N/A"); }
  try { console.log("symbol:", await usyc.symbol()); } catch(e: any) { console.log("symbol: N/A"); }
  try { console.log("totalSupply:", (await usyc.totalSupply()).toString()); } catch(e: any) { console.log("totalSupply: N/A"); }
  try { console.log("owner:", await usyc.owner()); } catch(e: any) { console.log("owner: N/A (no owner function)"); }

  // Try minting 1 USYC (1_000_000 with 6 decimals)
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  try {
    console.log("Attempting mint(deployer, 1_000_000)...");
    const tx = await usyc.getFunction("mint(address,uint256)")(deployer.address, 1_000_000n);
    const receipt = await tx.wait();
    console.log("Mint succeeded! tx:", receipt?.hash ?? tx.hash);
    const bal = await usyc.balanceOf(deployer.address);
    console.log("New USYC balance:", ethers.formatUnits(bal, 6));
  } catch (e: any) {
    console.log("mint(address,uint256) failed:", e.message?.slice(0, 200));
    try {
      console.log("Attempting mint(1_000_000)...");
      const tx = await usyc.getFunction("mint(uint256)")(1_000_000n);
      const receipt = await tx.wait();
      console.log("Mint succeeded! tx:", receipt?.hash ?? tx.hash);
    } catch (e2: any) {
      console.log("mint(uint256) failed:", e2.message?.slice(0, 200));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
