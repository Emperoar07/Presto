import hre from "hardhat";
const { ethers } = hre;

const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";

// Set this to the new USYCRewards address before running.
const NEW_REWARDS_ADDRESS = process.env.NEW_REWARDS_ADDRESS ?? "";

async function main() {
  if (!ethers.isAddress(NEW_REWARDS_ADDRESS)) {
    throw new Error("Set NEW_REWARDS_ADDRESS env var to the new contract address");
  }

  const [deployer] = await ethers.getSigners();
  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);

  const deployerBal = await usyc.balanceOf(deployer.address);
  console.log("Deployer USYC balance:", ethers.formatUnits(deployerBal, 6));

  if (deployerBal === 0n) {
    throw new Error("Deployer has 0 USYC. Withdraw from old contract first.");
  }

  const tx = await usyc.transfer(NEW_REWARDS_ADDRESS, deployerBal);
  await tx.wait();
  console.log(`Transferred ${ethers.formatUnits(deployerBal, 6)} USYC to ${NEW_REWARDS_ADDRESS}`);

  const after = await usyc.balanceOf(NEW_REWARDS_ADDRESS);
  console.log("New contract balance:", ethers.formatUnits(after, 6));
}

main().catch((e) => { console.error(e); process.exit(1); });
