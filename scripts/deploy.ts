import hre from "hardhat";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy WETH
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.deploy();
  await weth.waitForDeployment();
  console.log("WETH deployed to:", await weth.getAddress());

  // 2. Deploy Factory
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  console.log("UniswapV2Factory deployed to:", await factory.getAddress());

  // 3. Deploy Router
  const Router = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
  await router.waitForDeployment();
  console.log("UniswapV2Router02 deployed to:", await router.getAddress());

  // 4. Deploy Mock Tokens
  const Token = await ethers.getContractFactory("SimpleToken");
  
  const tokenA = await Token.deploy("Tempo Token", "TEMPO", 18);
  await tokenA.waitForDeployment();
  console.log("Token A (TEMPO) deployed to:", await tokenA.getAddress());

  const tokenB = await Token.deploy("USD Coin", "USDC", 6);
  await tokenB.waitForDeployment();
  console.log("Token B (USDC) deployed to:", await tokenB.getAddress());

  console.log("\nDeployment Complete!");
  console.log("----------------------------------------------------");
  console.log(`REACT_APP_FACTORY_ADDRESS=${await factory.getAddress()}`);
  console.log(`REACT_APP_ROUTER_ADDRESS=${await router.getAddress()}`);
  console.log(`REACT_APP_WETH_ADDRESS=${await weth.getAddress()}`);
  console.log(`REACT_APP_TOKEN_A_ADDRESS=${await tokenA.getAddress()}`);
  console.log(`REACT_APP_TOKEN_B_ADDRESS=${await tokenB.getAddress()}`);
  console.log("----------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
