import hre from "hardhat";

const USYC = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const OWNER = "0x8250e8c28178FDC736EC6e0258Cb26d4A8107F13";
const USER_WALLET = "0x117938e180481F0d1C022354B95429872454bB69";

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const { ethers } = hre;
  const usyc = await ethers.getContractAt(ABI, USYC);
  const dec = await usyc.decimals();

  const ownerBal = await usyc.balanceOf(OWNER);
  const userBal = await usyc.balanceOf(USER_WALLET);

  console.log("Owner balance:", ethers.formatUnits(ownerBal, dec));
  console.log("User wallet balance:", ethers.formatUnits(userBal, dec));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
