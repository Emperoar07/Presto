import hre from "hardhat";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
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
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (chainId !== 5042002n) {
    throw new Error(`Expected Arc Testnet (5042002), got ${chainId.toString()}`);
  }

  console.log("========================================");
  console.log("Deploy TestUSYC + Seed USYC/USDC Pool");
  console.log("========================================");
  console.log("Deployer:", deployer.address);

  // 1. Deploy TestUSYC
  console.log("\n[1/5] Deploying TestUSYC...");
  const TestUSYC = await ethers.getContractFactory("TestUSYC");
  const usyc = await TestUSYC.deploy();
  await usyc.waitForDeployment();
  const usycAddress = await usyc.getAddress();
  console.log("  TestUSYC deployed to:", usycAddress);

  // 2. Mint USYC tokens (1 USYC = 1_000_000 with 6 decimals)
  const seedAmount = "1"; // 1 USYC + 1 USDC
  const mintAmount = ethers.parseUnits(seedAmount, 6);
  console.log("\n[2/5] Minting", seedAmount, "USYC to deployer...");
  const mintTx = await usyc.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("  Minted. Balance:", ethers.formatUnits(await usyc.balanceOf(deployer.address), 6), "USYC");

  // 3. Approve USYC and USDC for HubAMM
  console.log("\n[3/5] Approving tokens...");
  const approveTx1 = await usyc.approve(HUB_AMM, mintAmount);
  await approveTx1.wait();
  console.log("  USYC approved");

  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const usdcAmount = ethers.parseUnits(seedAmount, 6);
  const approveTx2 = await usdc.approve(HUB_AMM, usdcAmount);
  await approveTx2.wait();
  console.log("  USDC approved");

  // 4. Add liquidity
  console.log("\n[4/5] Adding liquidity (", seedAmount, "USYC +", seedAmount, "USDC)...");
  const amm = await ethers.getContractAt(HUB_AMM_ABI, HUB_AMM);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const addTx = await amm.addLiquidity(usycAddress, ARC_USDC, mintAmount, deadline);
  const receipt = await addTx.wait();
  console.log("  Liquidity added! Tx:", receipt?.hash ?? addTx.hash);

  // 5. Verify
  console.log("\n[5/5] Verifying pool state...");
  const [tokenReserve, pathReserve, shares] = await Promise.all([
    amm.tokenReserves(usycAddress),
    amm.pathReserves(usycAddress),
    amm.totalShares(usycAddress),
  ]);
  console.log("  USYC reserve:", ethers.formatUnits(tokenReserve, 6));
  console.log("  USDC reserve:", ethers.formatUnits(pathReserve, 6));
  console.log("  Total shares:", shares.toString());

  console.log("\n========================================");
  console.log("DONE!");
  console.log("========================================");
  console.log("\nUpdate tokens.ts USYC address to:", usycAddress);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deploy+Seed failed:", error);
    process.exit(1);
  });
