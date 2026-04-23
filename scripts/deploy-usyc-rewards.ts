import hre from "hardhat";
const { ethers } = hre;

const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const HUB_AMM_ADDRESS = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const USYC_FUND_AMOUNT = ethers.parseUnits("2000000", 6); // 2,000,000 USYC

// USYC pair on Arc gets 1.7%, everything else defaults to 1.5%
const USYC_TOKEN_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const USYC_PAIR_RATE_BPS = 170;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying USYCRewards from:", deployer.address);

  const Rewards = await ethers.getContractFactory("USYCRewards");
  const rewards = await Rewards.deploy(USYC_ADDRESS, HUB_AMM_ADDRESS);
  await rewards.waitForDeployment();

  const address = await rewards.getAddress();
  console.log("USYCRewards deployed to:", address);

  // Set 1.7% for the USYC/USDC pair
  const tx1 = await rewards.setRewardRate(USYC_TOKEN_ADDRESS, USYC_PAIR_RATE_BPS);
  await tx1.wait();
  console.log(`Set reward rate for USYC pair: ${USYC_PAIR_RATE_BPS} bps (1.7%)`);

  // Fund the contract with USYC
  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);

  // Mint to deployer first (TestUSYC is ownable)
  const mintTx = await usyc.mint(deployer.address, USYC_FUND_AMOUNT);
  await mintTx.wait();
  console.log(`Minted ${ethers.formatUnits(USYC_FUND_AMOUNT, 6)} USYC to deployer`);

  // Transfer to rewards contract
  const transferTx = await usyc.transfer(address, USYC_FUND_AMOUNT);
  await transferTx.wait();
  console.log(`Funded USYCRewards with ${ethers.formatUnits(USYC_FUND_AMOUNT, 6)} USYC`);

  console.log("\n=== DONE ===");
  console.log("  USYCRewards:", address);
  console.log("  Set in .env:");
  console.log(`  NEXT_PUBLIC_USYC_REWARDS_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
