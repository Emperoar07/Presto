import hre from "hardhat";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_USYC = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function mint(address to, uint256 amount) external",
];

const HUB_AMM_ABI = [
  "function addLiquidity(address userToken, address validatorToken, uint256 amount, uint256 deadline) external returns (uint256 mintedShares)",
  "function tokenReserves(address token) external view returns (uint256)",
  "function pathReserves(address token) external view returns (uint256)",
  "function totalShares(address token) external view returns (uint256)",
];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const usyc = await ethers.getContractAt(ERC20_ABI, ARC_USYC);
  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const amm = await ethers.getContractAt(HUB_AMM_ABI, HUB_AMM);

  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("USDC balance:", ethers.formatUnits(usdcBal, 6));

  // Use all available USDC (leave 0.1 for gas buffer)
  const bufferRaw = ethers.parseUnits("0.1", 6);
  const seedRaw = usdcBal > bufferRaw ? usdcBal - bufferRaw : 0n;
  if (seedRaw === 0n) {
    throw new Error("Not enough USDC to seed");
  }

  const seedAmount = ethers.formatUnits(seedRaw, 6);
  console.log("Seeding with:", seedAmount, "USYC +", seedAmount, "USDC");

  // Mint matching USYC
  console.log("Minting USYC...");
  const mintTx = await usyc.mint(deployer.address, seedRaw);
  await mintTx.wait();

  // Approve both
  console.log("Approving...");
  const a1 = await usyc.approve(HUB_AMM, seedRaw);
  await a1.wait();
  const a2 = await usdc.approve(HUB_AMM, seedRaw);
  await a2.wait();

  // Add liquidity
  console.log("Adding liquidity...");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const tx = await amm.addLiquidity(ARC_USYC, ARC_USDC, seedRaw, deadline);
  const receipt = await tx.wait();
  console.log("Done! Tx:", receipt?.hash ?? tx.hash);

  const [tR, pR, s] = await Promise.all([
    amm.tokenReserves(ARC_USYC),
    amm.pathReserves(ARC_USYC),
    amm.totalShares(ARC_USYC),
  ]);
  console.log("USYC reserve:", ethers.formatUnits(tR, 6));
  console.log("USDC reserve:", ethers.formatUnits(pR, 6));
  console.log("Total shares:", s.toString());
}

main().then(() => process.exit(0)).catch(e => { console.error("Failed:", e); process.exit(1); });
