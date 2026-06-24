import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy the in-repo Uniswap V2 fork to Arc Testnet and seed one USDC/WUSDC pool.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-uniswap-arc.ts --network arc --config hardhat.config.cjs
 *
 * Notes:
 *   - WUSDC (0x911b...) is a WETH9-style wrapper of native USDC, so we reuse it as the
 *     router's WETH and fund the WUSDC leg by wrapping native USDC (no faucet needed).
 *   - Seed amounts overridable via env: SEED_USDC (6dp units, default 5), SEED_WUSDC (default 5).
 */

const ARC_USDC = "0x3600000000000000000000000000000000000000"; // 6dp ERC20 USDC
const ARC_WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df"; // 18dp wrapped native USDC

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const WUSDC_ABI = [...ERC20_ABI, "function deposit() payable"];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("========================================");
  console.log("Uniswap V2 fork deployment - Arc Testnet");
  console.log("========================================");
  console.log("Chain ID:", chainId.toString());
  console.log("Deployer:", deployer.address);

  if (chainId !== 5042002n) {
    console.error("ERROR: expected Arc Testnet (5042002), got", chainId.toString());
    process.exit(1);
  }

  const nativeBal = await ethers.provider.getBalance(deployer.address);
  console.log("Native balance:", ethers.formatEther(nativeBal), "USDC");

  // --- Deploy Factory ---
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("UniswapV2Factory:", factoryAddr);

  // --- Deploy Router (reuse WUSDC as WETH) ---
  const Router = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(factoryAddr, ARC_WUSDC);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("UniswapV2Router02:", routerAddr, "(WETH = WUSDC)");

  // --- Token handles ---
  const usdc = new ethers.Contract(ARC_USDC, ERC20_ABI, deployer);
  const wusdc = new ethers.Contract(ARC_WUSDC, WUSDC_ABI, deployer);
  const usdcDec = Number(await usdc.decimals());
  const wusdcDec = Number(await wusdc.decimals());

  const seedUsdc = ethers.parseUnits(process.env.SEED_USDC ?? "5", usdcDec);
  const seedWusdc = ethers.parseUnits(process.env.SEED_WUSDC ?? "5", wusdcDec);
  console.log(
    `Seed target: ${ethers.formatUnits(seedUsdc, usdcDec)} USDC / ${ethers.formatUnits(seedWusdc, wusdcDec)} WUSDC`
  );

  // --- Ensure WUSDC balance by wrapping native ---
  let wusdcBal: bigint = await wusdc.balanceOf(deployer.address);
  if (wusdcBal < seedWusdc) {
    const need = seedWusdc - wusdcBal;
    console.log("Wrapping", ethers.formatUnits(need, wusdcDec), "native USDC -> WUSDC...");
    await (await wusdc.deposit({ value: need })).wait();
    wusdcBal = await wusdc.balanceOf(deployer.address);
  }

  const usdcBal: bigint = await usdc.balanceOf(deployer.address);
  if (usdcBal < seedUsdc) {
    console.error(`ERROR: insufficient USDC. have ${ethers.formatUnits(usdcBal, usdcDec)}, need ${ethers.formatUnits(seedUsdc, usdcDec)}`);
    process.exit(1);
  }

  // --- Create pair ---
  let pair: string = await factory.getPair(ARC_USDC, ARC_WUSDC);
  if (pair === ethers.ZeroAddress) {
    await (await factory.createPair(ARC_USDC, ARC_WUSDC)).wait();
    pair = await factory.getPair(ARC_USDC, ARC_WUSDC);
  }
  console.log("USDC/WUSDC pair:", pair);

  // --- Approve + add liquidity ---
  await (await usdc.approve(routerAddr, seedUsdc)).wait();
  await (await wusdc.approve(routerAddr, seedWusdc)).wait();

  const deadline = Math.floor(Date.now() / 1000) + 1200;
  await (
    await router.addLiquidity(
      ARC_USDC,
      ARC_WUSDC,
      seedUsdc,
      seedWusdc,
      0,
      0,
      deployer.address,
      deadline
    )
  ).wait();
  console.log("Liquidity added.");

  // --- Persist deployment ---
  const out = {
    chainId: chainId.toString(),
    network: "arc-testnet",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    UniswapV2Factory: factoryAddr,
    UniswapV2Router02: routerAddr,
    WETH: ARC_WUSDC,
    pools: { "USDC/WUSDC": pair },
  };
  const dir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "uniswap-arc.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("Saved", file);

  console.log("\n=== ADD TO .env ===");
  console.log(`NEXT_PUBLIC_UNISWAP_V2_FACTORY_5042002=${factoryAddr}`);
  console.log(`NEXT_PUBLIC_UNISWAP_V2_ROUTER_5042002=${routerAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
