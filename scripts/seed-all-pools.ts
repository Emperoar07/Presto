import hre from "hardhat";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";

const TOKENS = [
  { name: "EURC",  addr: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", dec: 6,  mintable: false },
  { name: "USDT",  addr: "0x175CdB1D338945f0D851A741ccF787D343E57952", dec: 18, mintable: false },
  { name: "WUSDC", addr: "0x911b4000D3422F482F4062a913885f7b035382Df", dec: 18, mintable: false },
  { name: "USYC",  addr: "0x825Ae482558415310C71B7E03d2BbBe409345903", dec: 6,  mintable: true },
];

const ERC20_ABI = [
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256) external",
];

const AMM_ABI = [
  "function addLiquidity(address,address,uint256,uint256) external returns (uint256)",
  "function tokenReserves(address) view returns (uint256)",
  "function pathReserves(address) view returns (uint256)",
  "function totalShares(address) view returns (uint256)",
];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt(ERC20_ABI, ARC_USDC);
  const amm = await ethers.getContractAt(AMM_ABI, HUB_AMM);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

  let usdcBal = await usdc.balanceOf(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Starting USDC balance:", ethers.formatUnits(usdcBal, 6));
  console.log("========================================\n");

  // --- Phase 1: Seed EURC, USDT, WUSDC with whatever balance deployer has ---
  for (const t of TOKENS.filter(t => !t.mintable)) {
    const token = await ethers.getContractAt(ERC20_ABI, t.addr);
    const bal = await token.balanceOf(deployer.address);
    if (bal === 0n) {
      console.log(`[${t.name}] Balance is 0, skipping.`);
      continue;
    }

    // For existing pools, the AMM calculates USDC needed from reserves ratio.
    // We just approve the full token balance and let the contract decide USDC amount.
    console.log(`[${t.name}] Seeding with ${ethers.formatUnits(bal, t.dec)}...`);

    const a1 = await token.approve(HUB_AMM, bal);
    await a1.wait();

    // Approve generous USDC (100 USDC max per non-mintable token)
    const maxUsdc = ethers.parseUnits("100", 6);
    const a2 = await usdc.approve(HUB_AMM, maxUsdc);
    await a2.wait();

    try {
      const tx = await amm.addLiquidity(t.addr, ARC_USDC, bal, deadline);
      const receipt = await tx.wait();
      const [tR, pR] = await Promise.all([
        amm.tokenReserves(t.addr),
        amm.pathReserves(t.addr),
      ]);
      console.log(`  Done! Tx: ${receipt?.hash ?? tx.hash}`);
      console.log(`  ${t.name} reserve: ${ethers.formatUnits(tR, t.dec)}`);
      console.log(`  USDC reserve: ${ethers.formatUnits(pR, 6)}`);
    } catch (e: any) {
      console.log(`  FAILED: ${e.message?.slice(0, 150)}`);
    }
    console.log("");
  }

  // --- Phase 2: Seed USYC with the bulk of remaining USDC ---
  usdcBal = await usdc.balanceOf(deployer.address);
  const reserveBuffer = ethers.parseUnits("0.5", 6);
  const usycSeedRaw = usdcBal > reserveBuffer ? usdcBal - reserveBuffer : 0n;

  if (usycSeedRaw > 0n) {
    const usycToken = await ethers.getContractAt(ERC20_ABI, TOKENS[3].addr);

    // Calculate how much USYC to mint based on current pool ratio
    const tR = await amm.tokenReserves(TOKENS[3].addr);
    const pR = await amm.pathReserves(TOKENS[3].addr);

    let usycMintAmount: bigint;
    if (tR === 0n || pR === 0n) {
      // 1:1 for fresh pool
      usycMintAmount = usycSeedRaw;
    } else {
      // Match the ratio: usycAmount = usdc * tokenReserve / pathReserve
      usycMintAmount = (usycSeedRaw * tR) / pR;
    }

    console.log(`[USYC] Minting ${ethers.formatUnits(usycMintAmount, 6)} USYC...`);
    const mintTx = await usycToken.mint(deployer.address, usycMintAmount);
    await mintTx.wait();

    console.log(`[USYC] Seeding with ${ethers.formatUnits(usycMintAmount, 6)} USYC + ~${ethers.formatUnits(usycSeedRaw, 6)} USDC...`);
    const a1 = await usycToken.approve(HUB_AMM, usycMintAmount);
    await a1.wait();
    const a2 = await usdc.approve(HUB_AMM, usycSeedRaw);
    await a2.wait();

    try {
      const tx = await amm.addLiquidity(TOKENS[3].addr, ARC_USDC, usycMintAmount, deadline);
      const receipt = await tx.wait();
      const [finalTR, finalPR, shares] = await Promise.all([
        amm.tokenReserves(TOKENS[3].addr),
        amm.pathReserves(TOKENS[3].addr),
        amm.totalShares(TOKENS[3].addr),
      ]);
      console.log(`  Done! Tx: ${receipt?.hash ?? tx.hash}`);
      console.log(`  USYC reserve: ${ethers.formatUnits(finalTR, 6)}`);
      console.log(`  USDC reserve: ${ethers.formatUnits(finalPR, 6)}`);
      console.log(`  Total shares: ${shares.toString()}`);
    } catch (e: any) {
      console.log(`  FAILED: ${e.message?.slice(0, 200)}`);
    }
  }

  // Final USDC balance
  const finalUsdc = await usdc.balanceOf(deployer.address);
  console.log("\n========================================");
  console.log("Remaining USDC:", ethers.formatUnits(finalUsdc, 6));
  console.log("========================================");
}

main().then(() => process.exit(0)).catch(e => { console.error("Failed:", e); process.exit(1); });
