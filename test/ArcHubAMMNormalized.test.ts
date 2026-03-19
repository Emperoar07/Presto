import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { calculateExpectedOutput, getCurrentTimestamp, parseTokens } from "./helpers.ts";

async function deployArcNormalizedFixture() {
  const [owner, user1, user2] = await ethers.getSigners();
  const SimpleToken = await ethers.getContractFactory("SimpleToken");

  const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const eurc = await SimpleToken.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();

  const usdt = await SimpleToken.deploy("Tether USD", "USDT", 18);
  await usdt.waitForDeployment();

  const wusdc = await SimpleToken.deploy("Wrapped USDC", "WUSDC", 18);
  await wusdc.waitForDeployment();

  const ArcHubAMMNormalized = await ethers.getContractFactory("ArcHubAMMNormalized");
  const amm = await ArcHubAMMNormalized.deploy(await usdc.getAddress());
  await amm.waitForDeployment();

  return { amm, owner, user1, user2, tokens: { usdc, eurc, usdt, wusdc } };
}

async function addLiquidityWithHub(
  amm: Awaited<ReturnType<typeof ethers.getContractAt>>,
  userToken: Awaited<ReturnType<typeof ethers.getContractAt>>,
  hubToken: Awaited<ReturnType<typeof ethers.getContractAt>>,
  signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  userAmount: bigint,
  hubAmount: bigint
) {
  await userToken.mint(signer.address, userAmount);
  await hubToken.mint(signer.address, hubAmount);
  await userToken.connect(signer).approve(await amm.getAddress(), ethers.MaxUint256);
  await hubToken.connect(signer).approve(await amm.getAddress(), ethers.MaxUint256);

  const deadline = BigInt(await getCurrentTimestamp()) + 1800n;
  return amm.connect(signer).addLiquidity(
    await userToken.getAddress(),
    await hubToken.getAddress(),
    userAmount,
    deadline
  );
}

async function swapViaHub(
  amm: Awaited<ReturnType<typeof ethers.getContractAt>>,
  tokenIn: Awaited<ReturnType<typeof ethers.getContractAt>>,
  tokenOut: Awaited<ReturnType<typeof ethers.getContractAt>>,
  signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  amountIn: bigint
) {
  await tokenIn.mint(signer.address, amountIn);
  await tokenIn.connect(signer).approve(await amm.getAddress(), ethers.MaxUint256);

  const deadline = BigInt(await getCurrentTimestamp()) + 1800n;
  return amm.connect(signer).swap(
    await tokenIn.getAddress(),
    await tokenOut.getAddress(),
    amountIn,
    0,
    deadline
  );
}

describe("ArcHubAMMNormalized", function () {
  it("adds initial mixed-decimal liquidity using equal human values", async function () {
    const { amm, user1, tokens } = await loadFixture(deployArcNormalizedFixture);

    const usdtAmount = parseTokens("5", 18);
    const usdcAmount = parseTokens("5", 6);

    await expect(addLiquidityWithHub(amm, tokens.usdt, tokens.usdc, user1, usdtAmount, usdcAmount)).to.not.be
      .reverted;

    const usdtAddress = await tokens.usdt.getAddress();
    expect(await amm.tokenReserves(usdtAddress)).to.equal(usdtAmount);
    expect(await amm.pathReserves(usdtAddress)).to.equal(usdcAmount);
    expect(await amm.totalShares(usdtAddress)).to.be.gt(0);
  });

  it("quotes USDC to USDT using normalized reserves", async function () {
    const { amm, user1, tokens } = await loadFixture(deployArcNormalizedFixture);

    await addLiquidityWithHub(
      amm,
      tokens.usdt,
      tokens.usdc,
      user1,
      parseTokens("5", 18),
      parseTokens("5", 6)
    );

    const amountInRaw = parseTokens("1", 6);
    const amountInNormalized = parseTokens("1", 18);
    const reserveNormalized = parseTokens("5", 18);
    const expectedOut = calculateExpectedOutput(amountInNormalized, reserveNormalized, reserveNormalized);

    expect(
      await amm.getQuote(await tokens.usdc.getAddress(), await tokens.usdt.getAddress(), amountInRaw)
    ).to.equal(expectedOut);
  });

  it("routes EURC to USDT through the USDC hub", async function () {
    const { amm, user1, user2, tokens } = await loadFixture(deployArcNormalizedFixture);

    await addLiquidityWithHub(
      amm,
      tokens.eurc,
      tokens.usdc,
      user1,
      parseTokens("5", 6),
      parseTokens("5", 6)
    );

    await addLiquidityWithHub(
      amm,
      tokens.usdt,
      tokens.usdc,
      user1,
      parseTokens("5", 18),
      parseTokens("5", 6)
    );

    const eurcIn = parseTokens("1", 6);
    const firstHopOut = calculateExpectedOutput(parseTokens("1", 18), parseTokens("5", 18), parseTokens("5", 18));
    const roundedFirstHop = (firstHopOut / 10n ** 12n) * 10n ** 12n;
    const expectedOut = calculateExpectedOutput(roundedFirstHop, parseTokens("5", 18), parseTokens("5", 18));

    expect(
      await amm.getQuote(await tokens.eurc.getAddress(), await tokens.usdt.getAddress(), eurcIn)
    ).to.equal(expectedOut);

    await expect(swapViaHub(amm, tokens.eurc, tokens.usdt, user2, eurcIn)).to.not.be.reverted;

    const userBalance = await tokens.usdt.balanceOf(user2.address);
    expect(userBalance).to.equal(expectedOut);
  });
});
