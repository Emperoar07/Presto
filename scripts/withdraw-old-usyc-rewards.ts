import hre from "hardhat";
const { ethers } = hre;

const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const OLD_REWARDS_ADDRESS = "0x297EDe265Bbc697B409fB371386eBD6370553Dec";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Withdrawing from:", OLD_REWARDS_ADDRESS);
  console.log("Owner:", deployer.address);

  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);
  const balance = await usyc.balanceOf(OLD_REWARDS_ADDRESS);
  console.log("Old contract USYC balance:", ethers.formatUnits(balance, 6));

  if (balance === 0n) {
    console.log("Nothing to withdraw.");
    return;
  }

  const rewards = await ethers.getContractAt("USYCRewards", OLD_REWARDS_ADDRESS);
  const tx = await rewards.withdrawUsyc(balance);
  await tx.wait();

  const after = await usyc.balanceOf(OLD_REWARDS_ADDRESS);
  const deployerBal = await usyc.balanceOf(deployer.address);
  console.log("Old contract balance after:", ethers.formatUnits(after, 6));
  console.log("Deployer USYC balance:", ethers.formatUnits(deployerBal, 6));
}

main().catch((e) => { console.error(e); process.exit(1); });
