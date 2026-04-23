import hre from "hardhat";
const { ethers } = hre;

const USYC_ADDRESS = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const REWARDS_ADDRESS = "0x297EDe265Bbc697B409fB371386eBD6370553Dec";
const AMOUNT = ethers.parseUnits("1000000", 6); // top up 1M more → total 2M

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Funding from:", deployer.address);

  const usyc = await ethers.getContractAt("TestUSYC", USYC_ADDRESS);

  const before = await usyc.balanceOf(REWARDS_ADDRESS);
  console.log("Current contract balance:", ethers.formatUnits(before, 6), "USYC");

  const mint = await usyc.mint(deployer.address, AMOUNT);
  await mint.wait();
  console.log("Minted 1,000,000 USYC to deployer");

  const transfer = await usyc.transfer(REWARDS_ADDRESS, AMOUNT);
  await transfer.wait();
  console.log("Transferred to USYCRewards");

  const after = await usyc.balanceOf(REWARDS_ADDRESS);
  console.log("New contract balance:", ethers.formatUnits(after, 6), "USYC");
}

main().catch((e) => { console.error(e); process.exit(1); });
