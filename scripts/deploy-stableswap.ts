import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy script for ArcStableSwapPool on Arc Testnet
 *
 * Usage:
 *   npx hardhat run scripts/deploy-stableswap.ts --network arc
 *
 * Prerequisites:
 *   1. Fund deployer wallet with Arc-usable gas token (USDC)
 *   2. Set PRIVATE_KEY in .env
 */

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_USDT = "0x175CdB1D338945f0D851A741ccF787D343E57952";
const ARC_WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

const STABLE_BASKET = [ARC_USDC, ARC_EURC, ARC_USDT, ARC_WUSDC];
const AMP_FACTOR = 200;
const FEE_BPS = 4; // 0.04% swap fee

interface Deployment {
  chainName: string;
  HUB_AMM_ADDRESS?: string;
  ARC_STABLESWAP_ADDRESS?: string;
  tokens: Record<string, string>;
  deployedAt?: string;
  deployer?: string;
}

interface DeploymentsFile {
  [chainId: string]: Deployment;
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("========================================");
  console.log("ArcStableSwapPool Deployment - Arc Testnet");
  console.log("========================================");
  console.log("Chain ID:", chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatUnits(balance, 18), "native Arc units (USDC)");
  console.log("----------------------------------------");

  if (chainId !== 5042002n && chainId !== 31337n) {
    console.error("ERROR: Expected Arc Testnet (chainId 5042002) or Hardhat (31337), got", chainId.toString());
    process.exit(1);
  }

  console.log("\n[1/2] Deploying ArcStableSwapPool...");
  const ArcStableSwapPool = await ethers.getContractFactory("ArcStableSwapPool");
  const pool = await ArcStableSwapPool.deploy(STABLE_BASKET, AMP_FACTOR, FEE_BPS);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("  ArcStableSwapPool deployed to:", poolAddress);

  console.log("\n[2/2] Saving deployment addresses...");

  const deploymentsPath = path.join(process.cwd(), "data/deployments.json");
  const dataDir = path.dirname(deploymentsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let deployments: DeploymentsFile = {};
  if (fs.existsSync(deploymentsPath)) {
    try {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    } catch {
      console.log("  Could not parse existing deployments.json, creating new file");
    }
  }

  const existing = deployments[chainId.toString()] || {
    chainName: chainId === 31337n ? "hardhat" : "arc-testnet",
    tokens: {
      USDC: ARC_USDC,
      EURC: ARC_EURC,
      USDT: ARC_USDT,
      WUSDC: ARC_WUSDC,
    }
  };

  deployments[chainId.toString()] = {
    ...existing,
    ARC_STABLESWAP_ADDRESS: poolAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("  Saved to data/deployments.json");

  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("  ARC_STABLESWAP_ADDRESS:", poolAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
