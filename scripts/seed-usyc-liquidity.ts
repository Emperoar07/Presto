import hre from "hardhat";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_USYC = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
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

  const usyc = await ethers.getContractAt(ERC20_ABI, ARC_USYC);
  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const amm = await ethers.getContractAt(HUB_AMM_ABI, HUB_AMM);

  const [usycDecimals, usdcDecimals, usycBalance, usdcBalance] = await Promise.all([
    usyc.decimals(),
    usdc.decimals(),
    usyc.balanceOf(deployer.address),
    usdc.balanceOf(deployer.address),
  ]);

  console.log("========================================");
  console.log("Seed USYC/USDC Pool");
  console.log("========================================");
  console.log("Deployer:", deployer.address);
  console.log("USYC balance:", ethers.formatUnits(usycBalance, usycDecimals));
  console.log("USDC balance:", ethers.formatUnits(usdcBalance, usdcDecimals));
  console.log("USYC decimals:", Number(usycDecimals));
  console.log("USDC decimals:", Number(usdcDecimals));
  console.log("----------------------------------------");

  // Use a small seed amount — 1 USYC
  const seedAmount = process.env.ARC_SEED_USYC_AMOUNT ?? "1";
  const usycAmount = ethers.parseUnits(seedAmount, Number(usycDecimals));
  const usdcRequired = ethers.parseUnits(seedAmount, Number(usdcDecimals));

  console.log("Seed amount:", seedAmount, "USYC");
  console.log("USDC needed:", seedAmount, "USDC");

  if (usycBalance < usycAmount) {
    throw new Error(`Insufficient USYC balance: have ${ethers.formatUnits(usycBalance, usycDecimals)}, need ${seedAmount}`);
  }
  if (usdcBalance < usdcRequired) {
    throw new Error(`Insufficient USDC balance: have ${ethers.formatUnits(usdcBalance, usdcDecimals)}, need ${seedAmount}`);
  }

  // Approve USYC
  const usycAllowance = await usyc.allowance(deployer.address, HUB_AMM);
  if (usycAllowance < usycAmount) {
    console.log("Approving USYC...");
    const approveTx = await usyc.approve(HUB_AMM, usycAmount);
    await approveTx.wait();
    console.log("USYC approved.");
  }

  // Approve USDC
  const usdcAllowance = await usdc.allowance(deployer.address, HUB_AMM);
  if (usdcAllowance < usdcRequired) {
    console.log("Approving USDC...");
    const approveTx = await usdc.approve(HUB_AMM, usdcRequired);
    await approveTx.wait();
    console.log("USDC approved.");
  }

  // Add liquidity: userToken=USYC, validatorToken=USDC (hub)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  console.log("Adding liquidity...");
  const tx = await amm.addLiquidity(ARC_USYC, ARC_USDC, usycAmount, deadline);
  const receipt = await tx.wait();

  const [tokenReserve, pathReserve, shares] = await Promise.all([
    amm.tokenReserves(ARC_USYC),
    amm.pathReserves(ARC_USYC),
    amm.totalShares(ARC_USYC),
  ]);

  console.log("========================================");
  console.log("DONE! Tx:", receipt?.hash ?? tx.hash);
  console.log("USYC reserve:", ethers.formatUnits(tokenReserve, usycDecimals));
  console.log("USDC reserve:", ethers.formatUnits(pathReserve, usdcDecimals));
  console.log("Total shares:", shares.toString());
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
