import hre from "hardhat";
import fs from "fs";
import path from "path";

const ARC_USDC = "0x3600000000000000000000000000000000000000";

const ARC_TOKENS = {
  eurc: {
    symbol: "EURC",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  },
  usdt: {
    symbol: "USDT",
    address: "0x175CdB1D338945f0D851A741ccF787D343E57952",
  },
  wusdc: {
    symbol: "WUSDC",
    address: "0x911b4000D3422F482F4062a913885f7b035382Df",
  },
} as const;

type ArcTokenKey = keyof typeof ARC_TOKENS;

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

function getRequestedToken(): ArcTokenKey {
  const requested = (process.env.ARC_SEED_TOKEN ?? process.argv[2] ?? "eurc").toLowerCase();
  if (requested === "eurc" || requested === "usdt" || requested === "wusdc") {
    return requested;
  }
  throw new Error(`Unsupported ARC_SEED_TOKEN "${requested}". Use eurc, usdt, or wusdc.`);
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

  const tokenKey = getRequestedToken();
  const seedToken = ARC_TOKENS[tokenKey];
  const amountInput = process.env.ARC_SEED_AMOUNT ?? "5";
  const arcHubAmmAddress = resolveArcHubAmmAddress();

  const arcToken = await ethers.getContractAt(ERC20_ABI, seedToken.address);
  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const amm = await ethers.getContractAt(HUB_AMM_ABI, arcHubAmmAddress);

  const [tokenDecimals, usdcDecimals, tokenBalance, usdcBalance] = await Promise.all([
    arcToken.decimals(),
    usdc.decimals(),
    arcToken.balanceOf(deployer.address),
    usdc.balanceOf(deployer.address),
  ]);

  const tokenAmount = ethers.parseUnits(amountInput, Number(tokenDecimals));
  const usdcRequired = ethers.parseUnits(amountInput, Number(usdcDecimals));

  console.log("========================================");
  console.log("Seed Arc Normalized Pool");
  console.log("========================================");
  console.log("Deployer:", deployer.address);
  console.log("Hub AMM:", arcHubAmmAddress);
  console.log("Target token:", seedToken.symbol);
  console.log("Target amount:", amountInput);
  console.log(`${seedToken.symbol} balance:`, ethers.formatUnits(tokenBalance, tokenDecimals));
  console.log("USDC balance:", ethers.formatUnits(usdcBalance, usdcDecimals));
  console.log("----------------------------------------");

  if (tokenBalance < tokenAmount) {
    throw new Error(`Insufficient ${seedToken.symbol} balance for seed amount`);
  }
  if (usdcBalance < usdcRequired) {
    throw new Error("Insufficient USDC balance for paired seed amount");
  }

  await ensureApproval(arcToken, deployer.address, arcHubAmmAddress, tokenAmount);
  await ensureApproval(usdc, deployer.address, arcHubAmmAddress, usdcRequired);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const tx = await amm.addLiquidity(seedToken.address, ARC_USDC, tokenAmount, deadline);
  const receipt = await tx.wait();

  const [tokenReserve, pathReserve, totalShares] = await Promise.all([
    amm.tokenReserves(seedToken.address),
    amm.pathReserves(seedToken.address),
    amm.totalShares(seedToken.address),
  ]);

  console.log("Liquidity tx:", receipt?.hash ?? tx.hash);
  console.log(`${seedToken.symbol} reserve:`, ethers.formatUnits(tokenReserve, tokenDecimals));
  console.log("USDC reserve:", ethers.formatUnits(pathReserve, usdcDecimals));
  console.log("Total shares:", totalShares.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
