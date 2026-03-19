import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy script for ArcHubAMMNormalized on Arc Testnet
 *
 * Usage:
 *   npx hardhat run scripts/deploy-arc.ts --network arc
 *
 * Prerequisites:
 *   1. Fund deployer wallet with Arc-usable USDC
 *   2. Set PRIVATE_KEY in .env
 */

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_USDT = "0x175CdB1D338945f0D851A741ccF787D343E57952";
const ARC_WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

interface Deployment {
  chainName: string;
  HUB_AMM_ADDRESS: string;
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
  console.log("ArcHubAMMNormalized Deployment - Arc Testnet");
  console.log("========================================");
  console.log("Chain ID:", chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "native Arc units");
  console.log("----------------------------------------");

  if (chainId !== 5042002n) {
    console.error("ERROR: Expected Arc Testnet (chainId 5042002), got", chainId.toString());
    process.exit(1);
  }

  console.log("\n[1/2] Deploying ArcHubAMMNormalized (hub token = USDC)...");
  const ArcHubAMMNormalized = await ethers.getContractFactory("ArcHubAMMNormalized");
  const hubAmm = await ArcHubAMMNormalized.deploy(ARC_USDC);
  await hubAmm.waitForDeployment();
  const hubAddress = await hubAmm.getAddress();
  console.log("  ArcHubAMMNormalized deployed to:", hubAddress);

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

  deployments[chainId.toString()] = {
    chainName: "arc-testnet",
    HUB_AMM_ADDRESS: hubAddress,
    tokens: {
      USDC: ARC_USDC,
      EURC: ARC_EURC,
      USDT: ARC_USDT,
      WUSDC: ARC_WUSDC,
    },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("  Saved to data/deployments.json");

  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("\nContract Addresses:");
  console.log("  HUB_AMM_ADDRESS:", hubAddress);
  console.log("\nToken Addresses:");
  console.log("  USDC:", ARC_USDC);
  console.log("  EURC:", ARC_EURC);
  console.log("  USDT:", ARC_USDT);
  console.log("  WUSDC:", ARC_WUSDC);
  console.log("\n----------------------------------------");
  console.log("Next steps:");
  console.log("  1. Set env var: NEXT_PUBLIC_HUB_AMM_ADDRESS_5042002=" + hubAddress);
  console.log("  2. Seed EURC/USDC");
  console.log("  3. Seed USDT/USDC and WUSDC/USDC if balances are available");
  console.log("  4. Verify contract on https://testnet.arcscan.app");
  console.log("----------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
