import hre from "hardhat";
import fs from "fs";
import path from "path";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

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

function resolveArcHubAmmAddress(): string {
  if (process.env.NEXT_PUBLIC_HUB_AMM_ADDRESS_5042002) {
    return process.env.NEXT_PUBLIC_HUB_AMM_ADDRESS_5042002;
  }

  const deploymentsPath = path.join(process.cwd(), "data/deployments.json");
  if (fs.existsSync(deploymentsPath)) {
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    const deployment = deployments["5042002"];
    if (deployment?.HUB_AMM_ADDRESS) {
      return deployment.HUB_AMM_ADDRESS;
    }
  }

  throw new Error("Could not resolve Arc hub AMM address from env or data/deployments.json");
}

async function ensureApproval(
  token: Awaited<ReturnType<typeof hre.ethers.getContractAt>>,
  owner: string,
  spender: string,
  amount: bigint
) {
  const allowance = await token.allowance(owner, spender);
  if (allowance >= amount) return;
  const approvalTx = await token.approve(spender, amount);
  await approvalTx.wait();
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (chainId !== 5042002n) {
    throw new Error(`Expected Arc Testnet (5042002), got ${chainId.toString()}`);
  }

  const amountInput = process.env.ARC_SEED_EURC_AMOUNT ?? "5";
  const arcHubAmmAddress = resolveArcHubAmmAddress();
  const eurc = await ethers.getContractAt(ERC20_ABI, ARC_EURC);
  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const amm = await ethers.getContractAt(HUB_AMM_ABI, arcHubAmmAddress);

  const [eurcDecimals, usdcDecimals, eurcBalance, usdcBalance] = await Promise.all([
    eurc.decimals(),
    usdc.decimals(),
    eurc.balanceOf(deployer.address),
    usdc.balanceOf(deployer.address),
  ]);

  const eurcAmount = ethers.parseUnits(amountInput, Number(eurcDecimals));
  const usdcRequired = ethers.parseUnits(amountInput, Number(usdcDecimals));

  console.log("========================================");
  console.log("Seed Arc Liquidity");
  console.log("========================================");
  console.log("Deployer:", deployer.address);
  console.log("Hub AMM:", arcHubAmmAddress);
  console.log("EURC amount:", amountInput);
  console.log("EURC balance:", ethers.formatUnits(eurcBalance, eurcDecimals));
  console.log("USDC balance:", ethers.formatUnits(usdcBalance, usdcDecimals));
  console.log("----------------------------------------");

  if (eurcBalance < eurcAmount) {
    throw new Error("Insufficient EURC balance for seed amount");
  }
  if (usdcBalance < usdcRequired) {
    throw new Error("Insufficient USDC balance for seed amount");
  }

  await ensureApproval(eurc, deployer.address, arcHubAmmAddress, eurcAmount);
  await ensureApproval(usdc, deployer.address, arcHubAmmAddress, usdcRequired);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const tx = await amm.addLiquidity(ARC_EURC, ARC_USDC, eurcAmount, deadline);
  const receipt = await tx.wait();

  const [tokenReserve, pathReserve, totalShares] = await Promise.all([
    amm.tokenReserves(ARC_EURC),
    amm.pathReserves(ARC_EURC),
    amm.totalShares(ARC_EURC),
  ]);

  console.log("Liquidity tx:", receipt?.hash ?? tx.hash);
  console.log("EURC reserve:", ethers.formatUnits(tokenReserve, eurcDecimals));
  console.log("USDC reserve:", ethers.formatUnits(pathReserve, usdcDecimals));
  console.log("Total shares:", totalShares.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
