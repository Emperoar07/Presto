import hre from "hardhat";

/**
 * Seed a USDC-paired pool on the existing Uniswap V2 fork (Arc Testnet).
 *   TOKEN=<addr> TOKEN_DECIMALS=<n> SEED_USDC=<n> SEED_TOKEN=<n> \
 *   npx hardhat run scripts/seed-uniswap-pool.ts --network arc --config hardhat.config.cjs
 *
 * Defaults seed 5 USDC / 5 EURC.
 */
const USDC = "0x3600000000000000000000000000000000000000"; // 6dp
const FACTORY = process.env.UNISWAP_V2_FACTORY || "0xd70dd32d5Ee254F92ed1B259B6a8c22dA5CCb754";
const ROUTER = process.env.UNISWAP_V2_ROUTER || "0x2c820034B1ccb6739d7F8E25c572Cb6Bb5ed7211";

const ERC20 = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const ROUTER_ABI = ["function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)"];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)", "function createPair(address,address) returns (address)"];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const tokenAddr = process.env.TOKEN || "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"; // EURC
  const token = new ethers.Contract(tokenAddr, ERC20, deployer);
  const usdc = new ethers.Contract(USDC, ERC20, deployer);
  const tokenDec = Number(await token.decimals());
  const usdcDec = Number(await usdc.decimals());

  const seedUsdc = ethers.parseUnits(process.env.SEED_USDC || "5", usdcDec);
  const seedToken = ethers.parseUnits(process.env.SEED_TOKEN || "5", tokenDec);

  console.log("Deployer:", deployer.address);
  console.log(`Seeding ${ethers.formatUnits(seedUsdc, usdcDec)} USDC / ${ethers.formatUnits(seedToken, tokenDec)} token ${tokenAddr}`);

  const [usdcBal, tokBal] = await Promise.all([usdc.balanceOf(deployer.address), token.balanceOf(deployer.address)]);
  if (usdcBal < seedUsdc) throw new Error(`Insufficient USDC: have ${ethers.formatUnits(usdcBal, usdcDec)}`);
  if (tokBal < seedToken) throw new Error(`Insufficient token: have ${ethers.formatUnits(tokBal, tokenDec)}`);

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer);
  let pair: string = await factory.getPair(USDC, tokenAddr);
  if (pair === ethers.ZeroAddress) {
    await (await factory.createPair(USDC, tokenAddr)).wait();
    pair = await factory.getPair(USDC, tokenAddr);
  }

  await (await usdc.approve(ROUTER, seedUsdc)).wait();
  await (await token.approve(ROUTER, seedToken)).wait();

  const router = new ethers.Contract(ROUTER, ROUTER_ABI, deployer);
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  await (await router.addLiquidity(USDC, tokenAddr, seedUsdc, seedToken, 0, 0, deployer.address, deadline)).wait();

  console.log("Pool seeded. pair:", pair);
}

main().catch((e) => { console.error(e); process.exit(1); });
