import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy script for TempoHubAMM and mock tokens
 *
 * Usage:
 *   npx hardhat run scripts/deploy_hub.ts --network localhost
 *   npx hardhat run scripts/deploy_hub.ts --network tempo-testnet
 *
 * This script:
 * 1. Deploys pathUSD and mock stablecoins (AlphaUSD, BetaUSD, ThetaUSD)
 * 2. Deploys the TempoHubAMM contract
 * 3. Adds initial liquidity to each pool
 * 4. Writes deployment addresses to data/deployments.json
 */

interface Deployment {
  chainName: string;
  HUB_AMM_ADDRESS: string;
  DEX_ADDRESS?: string;
  FEE_MANAGER_ADDRESS?: string;
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
  console.log("TempoHubAMM Deployment Script");
  console.log("========================================");
  console.log("Chain ID:", chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("----------------------------------------");

  // 1. Deploy Mock Tokens
  console.log("\n[1/4] Deploying mock tokens...");
  const SimpleToken = await ethers.getContractFactory("SimpleToken");

  const pathUSD = await SimpleToken.deploy("Path USD", "pathUSD", 18);
  await pathUSD.waitForDeployment();
  const pathUSDAddress = await pathUSD.getAddress();
  console.log("  pathUSD deployed to:", pathUSDAddress);

  const alphaUSD = await SimpleToken.deploy("Alpha USD", "AlphaUSD", 18);
  await alphaUSD.waitForDeployment();
  const alphaUSDAddress = await alphaUSD.getAddress();
  console.log("  AlphaUSD deployed to:", alphaUSDAddress);

  const betaUSD = await SimpleToken.deploy("Beta USD", "BetaUSD", 18);
  await betaUSD.waitForDeployment();
  const betaUSDAddress = await betaUSD.getAddress();
  console.log("  BetaUSD deployed to:", betaUSDAddress);

  const thetaUSD = await SimpleToken.deploy("Theta USD", "ThetaUSD", 18);
  await thetaUSD.waitForDeployment();
  const thetaUSDAddress = await thetaUSD.getAddress();
  console.log("  ThetaUSD deployed to:", thetaUSDAddress);

  // 2. Deploy TempoHubAMM
  console.log("\n[2/4] Deploying TempoHubAMM...");
  const TempoHubAMM = await ethers.getContractFactory("TempoHubAMM");
  const hubAmm = await TempoHubAMM.deploy(pathUSDAddress);
  await hubAmm.waitForDeployment();
  const hubAddress = await hubAmm.getAddress();
  console.log("  TempoHubAMM deployed to:", hubAddress);

  // 3. Add Initial Liquidity
  console.log("\n[3/4] Setting up initial liquidity...");

  // Mint tokens to deployer
  const mintAmount = ethers.parseEther("100000");
  await pathUSD.mint(deployer.address, mintAmount);
  await alphaUSD.mint(deployer.address, mintAmount);
  await betaUSD.mint(deployer.address, mintAmount);
  await thetaUSD.mint(deployer.address, mintAmount);
  console.log("  Minted 100,000 of each token to deployer");

  // Approve AMM
  await pathUSD.approve(hubAddress, ethers.MaxUint256);
  await alphaUSD.approve(hubAddress, ethers.MaxUint256);
  await betaUSD.approve(hubAddress, ethers.MaxUint256);
  await thetaUSD.approve(hubAddress, ethers.MaxUint256);
  console.log("  Approved AMM for all tokens");

  // Add Liquidity (1:1 ratio for stablecoins)
  const liquidityAmount = ethers.parseEther("10000");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline

  // addLiquidity(userToken, validatorToken, amount, deadline)
  await hubAmm.addLiquidity(alphaUSDAddress, pathUSDAddress, liquidityAmount, deadline);
  console.log("  Added liquidity: AlphaUSD/pathUSD");

  await hubAmm.addLiquidity(betaUSDAddress, pathUSDAddress, liquidityAmount, deadline);
  console.log("  Added liquidity: BetaUSD/pathUSD");

  await hubAmm.addLiquidity(thetaUSDAddress, pathUSDAddress, liquidityAmount, deadline);
  console.log("  Added liquidity: ThetaUSD/pathUSD");

  // 4. Write deployment addresses to JSON
  console.log("\n[4/4] Saving deployment addresses...");

  const deploymentsPath = path.join(process.cwd(), "data/deployments.json");

  // Ensure data directory exists
  const dataDir = path.dirname(deploymentsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Read existing deployments or create new object
  let deployments: DeploymentsFile = {};
  if (fs.existsSync(deploymentsPath)) {
    try {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    } catch {
      console.log("  Could not parse existing deployments.json, creating new file");
    }
  }

  // Get chain name
  const chainNames: Record<string, string> = {
    "31337": "hardhat",
    "42431": "tempo-testnet",
    "84532": "base-sepolia"
  };
  const chainName = chainNames[chainId.toString()] || `chain-${chainId}`;

  // Update deployments
  deployments[chainId.toString()] = {
    chainName,
    HUB_AMM_ADDRESS: hubAddress,
    tokens: {
      pathUSD: pathUSDAddress,
      AlphaUSD: alphaUSDAddress,
      BetaUSD: betaUSDAddress,
      ThetaUSD: thetaUSDAddress
    },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("  Saved to data/deployments.json");

  // Print summary
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("\nContract Addresses:");
  console.log("  HUB_AMM_ADDRESS:", hubAddress);
  console.log("\nToken Addresses:");
  console.log("  pathUSD:", pathUSDAddress);
  console.log("  AlphaUSD:", alphaUSDAddress);
  console.log("  BetaUSD:", betaUSDAddress);
  console.log("  ThetaUSD:", thetaUSDAddress);
  console.log("\n----------------------------------------");
  console.log("To use these addresses, set environment variable:");
  console.log("  NEXT_PUBLIC_HUB_AMM_ADDRESS=" + hubAddress);
  console.log("----------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
