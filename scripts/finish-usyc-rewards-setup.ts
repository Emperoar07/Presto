import hre from "hardhat";
const { ethers } = hre;

const REWARDS_ADDRESS = "0x3454fB11Ead7a10806434daE0A7EfFd289ABb908";
const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const USYC_FUND_AMOUNT = ethers.parseUnits("4000000", 6);

const PAIRS: { token: string; symbol: string; rateBps: number }[] = [
  { token: "0x825Ae482558415310C71B7E03d2BbBe409345903", symbol: "USYC", rateBps: 170 },
  { token: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", symbol: "EURC", rateBps: 150 },
  { token: "0x175CdB1D338945f0D851A741ccF787D343E57952", symbol: "USDT", rateBps: 150 },
  { token: "0x911b4000D3422F482F4062a913885f7b035382Df", symbol: "WUSDC", rateBps: 150 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Rewards:", REWARDS_ADDRESS);

  const rewards = await ethers.getContractAt("USYCRewards", REWARDS_ADDRESS);

  for (const pair of PAIRS) {
    const configured = await rewards.rewardRateConfigured(pair.token);
    if (!configured) {
      const tx = await rewards.setRewardRate(pair.token, pair.rateBps);
      await tx.wait();
      console.log(`  ${pair.symbol} rate set: ${pair.rateBps} bps`);
    } else {
      console.log(`  ${pair.symbol} rate already set, skipping`);
    }

    const enabled = await rewards.poolEnabled(pair.token);
    if (!enabled) {
      const tx = await rewards.setPoolEnabled(pair.token, true);
      await tx.wait();
      console.log(`  ${pair.symbol} enabled`);
    } else {
      console.log(`  ${pair.symbol} already enabled, skipping`);
    }
  }

  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);
  const currentBalance = await usyc.balanceOf(REWARDS_ADDRESS);
  console.log(`\nCurrent contract balance: ${ethers.formatUnits(currentBalance, 6)} USYC`);

  if (currentBalance < USYC_FUND_AMOUNT) {
    const need = USYC_FUND_AMOUNT - currentBalance;
    const deployerBal = await usyc.balanceOf(deployer.address);
    if (deployerBal < need) {
      const mintAmt = need - deployerBal;
      const mintTx = await usyc.mint(deployer.address, mintAmt);
      await mintTx.wait();
      console.log(`Minted ${ethers.formatUnits(mintAmt, 6)} USYC`);
    }
    const tx = await usyc.transfer(REWARDS_ADDRESS, need);
    await tx.wait();
    console.log(`Transferred ${ethers.formatUnits(need, 6)} USYC to contract`);
  }

  const finalBalance = await usyc.balanceOf(REWARDS_ADDRESS);
  console.log(`\n=== DONE ===`);
  console.log(`  USYCRewards: ${REWARDS_ADDRESS}`);
  console.log(`  Final balance: ${ethers.formatUnits(finalBalance, 6)} USYC`);
}

main().catch((e) => { console.error(e); process.exit(1); });
