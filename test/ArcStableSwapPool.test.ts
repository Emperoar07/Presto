import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

async function deployStableSwapFixture() {
  const SimpleToken = await ethers.getContractFactory("SimpleToken");
  const [owner, lpProvider, swapper] = await ethers.getSigners();

  const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const eurc = await SimpleToken.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();

  const usdt = await SimpleToken.deploy("Tether USD", "USDT", 18);
  await usdt.waitForDeployment();

  const wusdc = await SimpleToken.deploy("Wrapped USDC", "WUSDC", 18);
  await wusdc.waitForDeployment();

  const ArcStableSwapPool = await ethers.getContractFactory("ArcStableSwapPool");
  const pool = await ArcStableSwapPool.deploy(
    [
      await usdc.getAddress(),
      await eurc.getAddress(),
      await usdt.getAddress(),
      await wusdc.getAddress(),
    ],
    200,
    4
  );
  await pool.waitForDeployment();

  const mintAmount6 = 1_000_000_000n;
  const mintAmount18 = 1_000_000n * 10n ** 18n;

  await usdc.mint(lpProvider.address, mintAmount6);
  await eurc.mint(lpProvider.address, mintAmount6);
  await usdt.mint(lpProvider.address, mintAmount18);
  await wusdc.mint(lpProvider.address, mintAmount18);

  await usdc.mint(swapper.address, mintAmount6);
  await eurc.mint(swapper.address, mintAmount6);
  await usdt.mint(swapper.address, mintAmount18);
  await wusdc.mint(swapper.address, mintAmount18);

  return { pool, ArcStableSwapPool, tokens: { usdc, eurc, usdt, wusdc }, owner, lpProvider, swapper };
}

describe("ArcStableSwapPool", function () {
  it("registers the configured Arc stable basket on deploy", async function () {
    const { pool, tokens } = await loadFixture(deployStableSwapFixture);

    expect(await pool.getSupportedTokens()).to.deep.equal([
      await tokens.usdc.getAddress(),
      await tokens.eurc.getAddress(),
      await tokens.usdt.getAddress(),
      await tokens.wusdc.getAddress(),
    ]);
    expect(await pool.getTokenCount()).to.equal(4);
    expect(await pool.ampFactor()).to.equal(200);
    expect(await pool.feeBps()).to.equal(4);
    expect(await pool.tokenDecimals(await tokens.usdc.getAddress())).to.equal(6);
    expect(await pool.tokenDecimals(await tokens.usdt.getAddress())).to.equal(18);
    expect(await pool.isSupportedToken(await tokens.eurc.getAddress())).to.equal(true);
  });

  it("rejects duplicate tokens during setup", async function () {
    const SimpleToken = await ethers.getContractFactory("SimpleToken");
    const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const eurc = await SimpleToken.deploy("Euro Coin", "EURC", 6);
    await eurc.waitForDeployment();

    const ArcStableSwapPool = await ethers.getContractFactory("ArcStableSwapPool");
    await expect(
      ArcStableSwapPool.deploy(
        [await usdc.getAddress(), await eurc.getAddress(), await usdc.getAddress()],
        200,
        4
      )
    ).to.be.revertedWithCustomError(ArcStableSwapPool, "DuplicateToken");
  });

  it("adds balanced liquidity and mints LP shares", async function () {
    const { pool, tokens, lpProvider } = await loadFixture(deployStableSwapFixture);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const amounts = [
      5_000_000n,
      5_000_000n,
      5n * 10n ** 18n,
      5n * 10n ** 18n,
    ];

    await tokens.usdc.connect(lpProvider).approve(await pool.getAddress(), amounts[0]);
    await tokens.eurc.connect(lpProvider).approve(await pool.getAddress(), amounts[1]);
    await tokens.usdt.connect(lpProvider).approve(await pool.getAddress(), amounts[2]);
    await tokens.wusdc.connect(lpProvider).approve(await pool.getAddress(), amounts[3]);

    await expect(pool.connect(lpProvider).addLiquidity(amounts, 1n, deadline))
      .to.emit(pool, "LiquidityAdded");

    expect(await pool.totalLpSupply()).to.be.greaterThan(1000n);
    expect(await pool.lpBalanceOf(lpProvider.address)).to.be.greaterThan(0n);
    expect(await pool.reserves(await tokens.usdc.getAddress())).to.equal(amounts[0]);
    expect(await pool.reserves(await tokens.usdt.getAddress())).to.equal(amounts[2]);
  });

  it("returns a quote and swaps between supported stable assets", async function () {
    const { pool, tokens, lpProvider, swapper } = await loadFixture(deployStableSwapFixture);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const liquidity = [
      10_000_000n,
      10_000_000n,
      10n * 10n ** 18n,
      10n * 10n ** 18n,
    ];

    await tokens.usdc.connect(lpProvider).approve(await pool.getAddress(), liquidity[0]);
    await tokens.eurc.connect(lpProvider).approve(await pool.getAddress(), liquidity[1]);
    await tokens.usdt.connect(lpProvider).approve(await pool.getAddress(), liquidity[2]);
    await tokens.wusdc.connect(lpProvider).approve(await pool.getAddress(), liquidity[3]);
    await pool.connect(lpProvider).addLiquidity(liquidity, 1n, deadline);

    const quote = await pool.getQuote(await tokens.usdc.getAddress(), await tokens.eurc.getAddress(), 1_000_000n);
    expect(quote).to.be.greaterThan(0n);

    await tokens.usdc.connect(swapper).approve(await pool.getAddress(), 1_000_000n);
    await expect(
      pool.connect(swapper).swap(await tokens.usdc.getAddress(), await tokens.eurc.getAddress(), 1_000_000n, 1n, deadline)
    ).to.emit(pool, "TokenSwapped");
  });
});
