import hre from "hardhat";
const { ethers } = hre;

const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const HUB_AMM_ADDRESS = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const USYC_FUND_AMOUNT = ethers.parseUnits("4000000", 6); // 4,000,000 USYC

// Pair user-token => rate in basis points. USYC pair gets 1.7%, others 1.5%.
const PAIRS: { token: string; symbol: string; rateBps: number }[] = [
  { token: "0x825Ae482558415310C71B7E03d2BbBe409345903", symbol: "USYC", rateBps: 170 },
  { token: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", symbol: "EURC", rateBps: 150 },
  { token: "0x175CdB1D338945f0D851A741ccF787D343E57952", symbol: "USDT", rateBps: 150 },
  { token: "0x911b4000D3422F482F4062a913885f7b035382Df", symbol: "WUSDC", rateBps: 150 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying USYCRewards from:", deployer.address);

  const Rewards = await ethers.getContractFactory("USYCRewards");
  const rewards = await Rewards.deploy(USYC_ADDRESS, HUB_AMM_ADDRESS);
  await rewards.waitForDeployment();

  const address = await rewards.getAddress();
  console.log("USYCRewards deployed to:", address);

  for (const pair of PAIRS) {
    const rateTx = await rewards.setRewardRate(pair.token, pair.rateBps);
    await rateTx.wait();
    const enableTx = await rewards.setPoolEnabled(pair.token, true);
    await enableTx.wait();
    console.log(`  ${pair.symbol} pair: ${pair.rateBps} bps, enabled`);
  }

  // Mint and fund the contract with USYC
  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);

  const mintTx = await usyc.mint(deployer.address, USYC_FUND_AMOUNT);
  await mintTx.wait();
  console.log(`Minted ${ethers.formatUnits(USYC_FUND_AMOUNT, 6)} USYC to deployer`);

  const transferTx = await usyc.transfer(address, USYC_FUND_AMOUNT);
  await transferTx.wait();
  console.log(`Funded USYCRewards with ${ethers.formatUnits(USYC_FUND_AMOUNT, 6)} USYC`);

  console.log("\n=== DEPLOY DONE ===");
  console.log("  USYCRewards:", address);
  console.log("  Set in .env:");
  console.log(`  NEXT_PUBLIC_USYC_REWARDS_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
