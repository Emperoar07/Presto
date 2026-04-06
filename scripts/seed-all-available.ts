import hre from "hardhat";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_USYC = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_USDT = "0x175CdB1D338945f0D851A741ccF787D343E57952";
const ARC_WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const HUB_AMM = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";

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

  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("USDC balance:", ethers.formatUnits(usdcBal, 6));

  // Check non-mintable token balances
  const pairs = [
    { name: "EURC",  addr: ARC_EURC,  dec: 6 },
    { name: "USDT",  addr: ARC_USDT,  dec: 18 },
    { name: "WUSDC", addr: ARC_WUSDC, dec: 18 },
  ];

  let usdcUsed = 0n;
  for (const p of pairs) {
    const token = await ethers.getContractAt(ERC20_ABI, p.addr);
    const bal = await token.balanceOf(deployer.address);
    if (bal === 0n) {
      console.log(`\n[${p.name}] Balance is 0, skipping.`);
      continue;
    }
    console.log(`\n[${p.name}] Seeding with ${ethers.formatUnits(bal, p.dec)}...`);
    await (await token.approve(HUB_AMM, bal)).wait();
    await (await usdc.approve(HUB_AMM, ethers.parseUnits("500", 6))).wait();
    try {
      const tx = await amm.addLiquidity(p.addr, ARC_USDC, bal, deadline);
      await tx.wait();
      const [tR, pR] = await Promise.all([amm.tokenReserves(p.addr), amm.pathReserves(p.addr)]);
      console.log(`  Done! ${p.name} reserve: ${ethers.formatUnits(tR, p.dec)}, USDC reserve: ${ethers.formatUnits(pR, 6)}`);
    } catch(e: any) {
      console.log(`  FAILED: ${e.message?.slice(0, 150)}`);
    }
  }

  // Remaining USDC goes to USYC
  const remainingUsdc = await usdc.balanceOf(deployer.address);
  const buffer = ethers.parseUnits("0.5", 6);
  const usycUsdc = remainingUsdc > buffer ? remainingUsdc - buffer : 0n;

  if (usycUsdc > 0n) {
    const usyc = await ethers.getContractAt(ERC20_ABI, ARC_USYC);
    const tR = await amm.tokenReserves(ARC_USYC);
    const pR = await amm.pathReserves(ARC_USYC);
    const usycMint = tR > 0n && pR > 0n ? (usycUsdc * tR) / pR : usycUsdc;

    console.log(`\n[USYC] Minting ${ethers.formatUnits(usycMint, 6)} USYC...`);
    await (await usyc.mint(deployer.address, usycMint)).wait();
    await (await usyc.approve(HUB_AMM, usycMint)).wait();
    await (await usdc.approve(HUB_AMM, usycUsdc)).wait();

    console.log(`[USYC] Adding ${ethers.formatUnits(usycMint, 6)} USYC + ${ethers.formatUnits(usycUsdc, 6)} USDC...`);
    const tx = await amm.addLiquidity(ARC_USYC, ARC_USDC, usycMint, deadline);
    await tx.wait();
    const [tR2, pR2] = await Promise.all([amm.tokenReserves(ARC_USYC), amm.pathReserves(ARC_USYC)]);
    console.log(`  Done! USYC reserve: ${ethers.formatUnits(tR2, 6)}, USDC reserve: ${ethers.formatUnits(pR2, 6)}`);
  }

  const finalUsdc = await usdc.balanceOf(deployer.address);
  console.log("\n========================================");
  console.log("Remaining USDC:", ethers.formatUnits(finalUsdc, 6));
  console.log("========================================");
}

main().then(() => process.exit(0)).catch(e => { console.error("Failed:", e); process.exit(1); });
