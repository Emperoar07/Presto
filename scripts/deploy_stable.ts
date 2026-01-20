import hre from "hardhat";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying StableVault with account:", deployer.address);

  // 1. Deploy StableVault
  const StableVault = await ethers.getContractFactory("StableVault");
  const vault = await StableVault.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("StableVault deployed to:", vaultAddress);

  // 2. Deploy 4 Mock Tokens (for local testing/verification)
  // We won't force these addresses to match the user's request (0x20c...) because we can't easily on standard hardhat network
  // But we will print them so we can update config if we were doing a full local setup.
  const Token = await ethers.getContractFactory("SimpleToken");
  
  const tokens = [
    { name: "Path USD", symbol: "pathUSD" },
    { name: "Alpha USD", symbol: "AlphaUSD" },
    { name: "Beta USD", symbol: "BetaUSD" },
    { name: "Theta USD", symbol: "ThetaUSD" },
  ];

  for (const t of tokens) {
      const token = await Token.deploy(t.name, t.symbol, 18);
      await token.waitForDeployment();
      console.log(`${t.symbol} deployed to:`, await token.getAddress());
      
      // Mint some to deployer for testing
      await token.mint(deployer.address, ethers.parseEther("10000"));
      
      // Mint some to Vault to provide liquidity
      await token.mint(vaultAddress, ethers.parseEther("10000"));
  }

  console.log("----------------------------------------------------");
  console.log(`REACT_APP_STABLE_VAULT_ADDRESS=${vaultAddress}`);
  console.log("----------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
