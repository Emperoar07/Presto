import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

const YEAR = 365n * 24n * 60n * 60n;
const RATE_BPS = 150n;
const REWARD_DECIMAL_SCALE = 10n ** 12n;

async function deployRewardsFixture() {
  const [owner, lpProvider, swapper] = await ethers.getSigners();
  const SimpleToken = await ethers.getContractFactory("SimpleToken");

  const usyc = await SimpleToken.deploy("US Yield Coin", "USYC", 6);
  await usyc.waitForDeployment();

  const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const eurc = await SimpleToken.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();

  const ArcHubAMMNormalized = await ethers.getContractFactory("ArcHubAMMNormalized");
  const amm = await ArcHubAMMNormalized.deploy(await usdc.getAddress());
  await amm.waitForDeployment();

  const USYCRewards = await ethers.getContractFactory("USYCRewards");
  const rewards = await USYCRewards.deploy(await usyc.getAddress(), await amm.getAddress());
  await rewards.waitForDeployment();

  await rewards.setPoolEnabled(await eurc.getAddress(), true);
  await usyc.mint(await rewards.getAddress(), ethers.parseUnits("1000000", 6));

  return { owner, lpProvider, swapper, usyc, usdc, eurc, amm, rewards };
}

describe("USYCRewards", function () {
  it("accrues rewards from LP shares instead of current pool reserves", async function () {
    const { lpProvider, swapper, usyc, usdc, eurc, amm, rewards } = await loadFixture(deployRewardsFixture);
    const ammAddress = await amm.getAddress();
    const eurcAddress = await eurc.getAddress();
    const usdcAddress = await usdc.getAddress();
    const lpAmount = ethers.parseUnits("1000", 6);
    const deadline = BigInt(await time.latest()) + 3600n;

    await eurc.mint(lpProvider.address, lpAmount);
    await usdc.mint(lpProvider.address, lpAmount);
    await eurc.connect(lpProvider).approve(ammAddress, lpAmount);
    await usdc.connect(lpProvider).approve(ammAddress, lpAmount);
    await amm.connect(lpProvider).addLiquidity(eurcAddress, usdcAddress, lpAmount, deadline);
    await rewards.connect(lpProvider).snapshot(lpProvider.address, eurcAddress);

    const lpShares = await amm.shares(eurcAddress, lpProvider.address);
    await time.increase(30 * 24 * 60 * 60);

    const claimableBefore = await rewards.claimableOf(lpProvider.address, eurcAddress);
    const userTvl = (lpShares * 2n) / REWARD_DECIMAL_SCALE;
    const expectedReward = (userTvl * RATE_BPS * (30n * 24n * 60n * 60n)) / (10000n * YEAR);
    expect(claimableBefore).to.be.gte(expectedReward);
    expect(claimableBefore).to.be.lte(expectedReward + 10n);

    const largeSwap = ethers.parseUnits("900", 6);
    const swapDeadline = BigInt(await time.latest()) + 3600n;
    await usdc.mint(swapper.address, largeSwap);
    await usdc.connect(swapper).approve(ammAddress, largeSwap);
    await amm.connect(swapper).swap(usdcAddress, eurcAddress, largeSwap, 0, swapDeadline);

    const claimableAfterReserveMove = await rewards.claimableOf(lpProvider.address, eurcAddress);
    const maxOneBlockDrift = 10n;
    expect(claimableAfterReserveMove).to.be.lte(claimableBefore + maxOneBlockDrift);

    await rewards.connect(lpProvider).claim(eurcAddress);
    const claimedBalance = await usyc.balanceOf(lpProvider.address);
    expect(claimedBalance).to.be.gte(claimableAfterReserveMove);
    expect(claimedBalance).to.be.lte(claimableAfterReserveMove + maxOneBlockDrift);
  });
});
