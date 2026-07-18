import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;
const YEAR = 365n * 24n * 60n * 60n;

async function deployFixture() {
  const [owner, existingProvider, newProvider] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("SimpleToken");
  const usyc = await Token.deploy("US Yield Coin", "USYC", 6);
  const usdc = await Token.deploy("USD Coin", "USDC", 6);
  const cirBtc = await Token.deploy("Circle BTC", "cirBTC", 8);

  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(owner.address);
  const Router = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(await factory.getAddress(), await usdc.getAddress());

  const cirBtcSeed = ethers.parseUnits("1", 8);
  const usdcSeed = ethers.parseUnits("70000", 6);
  await cirBtc.mint(existingProvider.address, cirBtcSeed);
  await usdc.mint(existingProvider.address, usdcSeed);
  await cirBtc.connect(existingProvider).approve(await router.getAddress(), cirBtcSeed);
  await usdc.connect(existingProvider).approve(await router.getAddress(), usdcSeed);
  await router.connect(existingProvider).addLiquidity(
    await cirBtc.getAddress(),
    await usdc.getAddress(),
    cirBtcSeed,
    usdcSeed,
    cirBtcSeed,
    usdcSeed,
    existingProvider.address,
    BigInt(await time.latest()) + 3600n,
  );

  const pairAddress = await factory.getPair(await cirBtc.getAddress(), await usdc.getAddress());
  const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
  const Rewards = await ethers.getContractFactory("CirBtcLiquidityRewards");
  const rewards = await Rewards.deploy(
    await usyc.getAddress(),
    await cirBtc.getAddress(),
    await usdc.getAddress(),
    pairAddress,
    await router.getAddress(),
  );
  await usyc.mint(await rewards.getAddress(), ethers.parseUnits("1000000", 6));

  return { owner, existingProvider, newProvider, usyc, usdc, cirBtc, factory, router, pair, rewards };
}

async function signPermit(
  pair: Awaited<ReturnType<typeof ethers.getContractAt>>,
  owner: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  spender: string,
  value: bigint,
  deadline: bigint,
) {
  const pairAddress = await pair.getAddress();
  const nonce = await pair.nonces(owner.address);
  const signature = await owner.signTypedData(
    { name: "Tempo LPs", version: "1", chainId: 31337, verifyingContract: pairAddress },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { owner: owner.address, spender, value, nonce, deadline },
  );
  return ethers.Signature.from(signature);
}

describe("CirBtcLiquidityRewards", function () {
  it("uses the configured contracts and a fixed 1% reward rate", async function () {
    const { usyc, usdc, cirBtc, router, pair, rewards } = await loadFixture(deployFixture);

    expect(await rewards.usyc()).to.equal(await usyc.getAddress());
    expect(await rewards.usdc()).to.equal(await usdc.getAddress());
    expect(await rewards.cirBtc()).to.equal(await cirBtc.getAddress());
    expect(await rewards.pair()).to.equal(await pair.getAddress());
    expect(await rewards.router()).to.equal(await router.getAddress());
    expect(await rewards.rewardRateBps()).to.equal(100n);
  });

  it("activates an existing LP position with one permit transaction", async function () {
    const { existingProvider, usdc, pair, rewards } = await loadFixture(deployFixture);
    const lpAmount = await pair.balanceOf(existingProvider.address);
    const deadline = BigInt(await time.latest()) + 3600n;
    const signature = await signPermit(pair, existingProvider, await rewards.getAddress(), lpAmount, deadline);
    const token0 = await pair.token0();
    const usdcIsToken0 = token0.toLowerCase() === (await usdc.getAddress()).toLowerCase();
    const reserves = await pair.getReserves();
    const usdcReserve = usdcIsToken0 ? reserves[0] : reserves[1];
    const totalSupply = await pair.totalSupply();
    const expectedPrincipal = (lpAmount * usdcReserve * 2n) / totalSupply;

    await rewards.connect(existingProvider).activateWithPermit(
      lpAmount,
      deadline,
      signature.v,
      signature.r,
      signature.s,
    );

    expect(await pair.balanceOf(existingProvider.address)).to.equal(0n);
    expect(await pair.balanceOf(await rewards.getAddress())).to.equal(lpAmount);
    expect(await rewards.stakedLp(existingProvider.address)).to.equal(lpAmount);
    expect(await rewards.principalUsdc(existingProvider.address)).to.equal(expectedPrincipal);
  });

  it("automatically stakes LP minted by a new liquidity deposit", async function () {
    const { newProvider, usdc, cirBtc, pair, rewards } = await loadFixture(deployFixture);
    const cirBtcAmount = ethers.parseUnits("0.1", 8);
    const usdcAmount = ethers.parseUnits("7000", 6);
    await cirBtc.mint(newProvider.address, cirBtcAmount);
    await usdc.mint(newProvider.address, usdcAmount);
    await cirBtc.connect(newProvider).approve(await rewards.getAddress(), cirBtcAmount);
    await usdc.connect(newProvider).approve(await rewards.getAddress(), usdcAmount);

    await rewards.connect(newProvider).addLiquidity(
      cirBtcAmount,
      usdcAmount,
      cirBtcAmount * 99n / 100n,
      usdcAmount * 99n / 100n,
      BigInt(await time.latest()) + 3600n,
    );

    expect(await pair.balanceOf(newProvider.address)).to.equal(0n);
    expect(await rewards.stakedLp(newProvider.address)).to.be.greaterThan(0n);
    expect(await rewards.principalUsdc(newProvider.address)).to.be.closeTo(
      ethers.parseUnits("14000", 6),
      ethers.parseUnits("1", 6),
    );
  });

  it("uses the deployment valuation for existing LP after reserves move", async function () {
    const { existingProvider, newProvider, usdc, cirBtc, router, pair, rewards } = await loadFixture(deployFixture);
    const lpAmount = await pair.balanceOf(existingProvider.address);
    const principalPerLp = await rewards.principalPerLpX18();
    const swapAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(newProvider.address, swapAmount);
    await usdc.connect(newProvider).approve(await router.getAddress(), swapAmount);
    await router.connect(newProvider).swapExactTokensForTokens(
      swapAmount,
      0,
      [await usdc.getAddress(), await cirBtc.getAddress()],
      newProvider.address,
      BigInt(await time.latest()) + 3600n,
    );
    await pair.connect(existingProvider).approve(await rewards.getAddress(), lpAmount);

    await rewards.connect(existingProvider).activate(lpAmount);

    expect(await rewards.principalUsdc(existingProvider.address)).to.equal(lpAmount * principalPerLp / 10n ** 18n);
  });

  it("accrues and claims the configured USYC token", async function () {
    const { existingProvider, usyc, pair, rewards } = await loadFixture(deployFixture);
    const lpAmount = await pair.balanceOf(existingProvider.address);
    await pair.connect(existingProvider).approve(await rewards.getAddress(), lpAmount);
    await rewards.connect(existingProvider).activate(lpAmount);
    const principal = await rewards.principalUsdc(existingProvider.address);
    const checkpoint = await rewards.lastCheckpoint(existingProvider.address);
    await time.increase(30 * 24 * 60 * 60);

    const claimable = await rewards.claimableOf(existingProvider.address);
    const elapsed = BigInt(await time.latest()) - checkpoint;
    const expected = principal * 100n * elapsed / (10000n * YEAR);
    expect(claimable).to.equal(expected);

    await rewards.connect(existingProvider).claim();
    const rewardPerSecond = principal * 100n / (10000n * YEAR);
    expect(await usyc.balanceOf(existingProvider.address)).to.be.closeTo(claimable, rewardPerSecond + 2n);
    expect(await rewards.pendingRewards(existingProvider.address)).to.equal(0n);
  });

  it("removes activated liquidity while preserving earned rewards", async function () {
    const { existingProvider, usdc, cirBtc, pair, rewards } = await loadFixture(deployFixture);
    const lpAmount = await pair.balanceOf(existingProvider.address);
    await pair.connect(existingProvider).approve(await rewards.getAddress(), lpAmount);
    await rewards.connect(existingProvider).activate(lpAmount);
    const principalBefore = await rewards.principalUsdc(existingProvider.address);
    await time.increase(7 * 24 * 60 * 60);

    const removedLp = lpAmount / 2n;
    await rewards.connect(existingProvider).removeLiquidity(
      removedLp,
      0,
      0,
      BigInt(await time.latest()) + 3600n,
    );

    const principalRemoved = principalBefore * removedLp / lpAmount;
    expect(await rewards.stakedLp(existingProvider.address)).to.equal(lpAmount - removedLp);
    expect(await rewards.principalUsdc(existingProvider.address)).to.equal(principalBefore - principalRemoved);
    expect(await rewards.pendingRewards(existingProvider.address)).to.be.greaterThan(0n);
    expect(await cirBtc.balanceOf(existingProvider.address)).to.be.greaterThan(0n);
    expect(await usdc.balanceOf(existingProvider.address)).to.be.greaterThan(0n);
  });
});
