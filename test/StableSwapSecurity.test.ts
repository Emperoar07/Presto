import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;
const DEADLINE = 9_999_999_999n; // far future

// ─────────────────────────────────────────────────────────────────────────────
// Finding #1 — StableVault decimal-mismatch drain
// ─────────────────────────────────────────────────────────────────────────────
describe("StableVault — decimal drain fix (Finding #1)", function () {
  async function fixture() {
    const SimpleToken = await ethers.getContractFactory("SimpleToken");
    const [owner, attacker] = await ethers.getSigners();

    const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const usdt = await SimpleToken.deploy("Tether USD", "USDT", 18);
    await usdt.waitForDeployment();

    const Vault = await ethers.getContractFactory("StableVault");
    const vault = await Vault.deploy([await usdc.getAddress(), await usdt.getAddress()]);
    await vault.waitForDeployment();

    await usdc.mint(await vault.getAddress(), 1000n * 10n ** 6n); // vault holds 1000 USDC
    return { vault, usdc, usdt, owner, attacker };
  }

  it("a tiny 18-dec input cannot drain the 6-dec reserve (old exploit reverts)", async function () {
    const { vault, usdc, usdt, attacker } = await loadFixture(fixture);
    await usdt.mint(attacker.address, 10n ** 18n);
    await usdt.connect(attacker).approve(await vault.getAddress(), ethers.MaxUint256);

    // Old bug: swap 1e9 USDT (0.000000001 USDT) -> 1e9 USDC (= 1000 USDC), draining the vault.
    // Fixed: 1e9 (18dp) scales to 1e9 / 1e12 = 0 (6dp) -> reverts, nothing leaves the vault.
    await expect(
      vault.connect(attacker).swap(await usdt.getAddress(), await usdc.getAddress(), 10n ** 9n),
    ).to.be.revertedWithCustomError(vault, "ZeroAmount");

    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(1000n * 10n ** 6n);
    expect(await usdc.balanceOf(attacker.address)).to.equal(0n);
  });

  it("swaps at 1:1 VALUE across decimals — draining 1000 USDC now costs 1000 USDT", async function () {
    const { vault, usdc, usdt, attacker } = await loadFixture(fixture);
    await usdt.mint(attacker.address, 1000n * 10n ** 18n);
    await usdt.connect(attacker).approve(await vault.getAddress(), ethers.MaxUint256);

    await vault.connect(attacker).swap(await usdt.getAddress(), await usdc.getAddress(), 1000n * 10n ** 18n);

    expect(await usdc.balanceOf(attacker.address)).to.equal(1000n * 10n ** 6n); // fair 1:1 value
    expect(await usdt.balanceOf(await vault.getAddress())).to.equal(1000n * 10n ** 18n); // vault got paid
    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(0n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding #2 — ArcStableSwapPool no-invariant / no-slippage
// ─────────────────────────────────────────────────────────────────────────────
describe("ArcStableSwapPool — Curve invariant fix (Finding #2)", function () {
  async function fixture() {
    const SimpleToken = await ethers.getContractFactory("SimpleToken");
    const [owner, attacker] = await ethers.getSigners();

    const a = await SimpleToken.deploy("USDC", "USDC", 18);
    await a.waitForDeployment();
    const b = await SimpleToken.deploy("USDT", "USDT", 18);
    await b.waitForDeployment();

    const Pool = await ethers.getContractFactory("ArcStableSwapPool");
    const pool = await Pool.deploy([await a.getAddress(), await b.getAddress()], 200, 4);
    await pool.waitForDeployment();

    const liq = 1_000_000n * 10n ** 18n;
    await a.mint(owner.address, liq);
    await b.mint(owner.address, liq);
    await a.approve(await pool.getAddress(), liq);
    await b.approve(await pool.getAddress(), liq);
    await pool.addLiquidity([liq, liq], 1, DEADLINE);

    return { pool, a, b, owner, attacker };
  }

  it("cannot drain the output reserve in one swap; huge input incurs huge slippage", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const reserveOut = await pool.reserves(await b.getAddress());

    const huge = 10_000_000n * 10n ** 18n; // 10x the pool
    const out = await pool.getQuote(await a.getAddress(), await b.getAddress(), huge);

    expect(out).to.be.lessThan(reserveOut); // never takes 100% of reserveOut
    expect(out).to.be.lessThan(huge / 2n); // paid 10M for < 0.5M out => real slippage
  });

  it("price impact rises as the output reserve is drawn down", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const per = 100_000n * 10n ** 18n;
    await a.mint(attacker.address, 2_000_000n * 10n ** 18n);
    await a.connect(attacker).approve(await pool.getAddress(), ethers.MaxUint256);

    const first = await pool.getQuote(await a.getAddress(), await b.getAddress(), per);
    // Heavily deplete the output reserve so the curve steepens near the floor.
    await pool.connect(attacker).swap(await a.getAddress(), await b.getAddress(), 900_000n * 10n ** 18n, 1, DEADLINE);
    const later = await pool.getQuote(await a.getAddress(), await b.getAddress(), per);

    // A real stableswap gives strictly (and here, substantially) less as reserveOut
    // collapses — the old formula stayed flat (<1% drift), which was the bug.
    expect(later).to.be.lessThan(first);
    expect(later * 100n).to.be.lessThan(first * 90n); // >10% degradation once imbalanced
  });

  it("a round trip loses value (no free extraction)", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const amt = 200_000n * 10n ** 18n;
    await a.mint(attacker.address, amt);
    await a.connect(attacker).approve(await pool.getAddress(), ethers.MaxUint256);
    await b.connect(attacker).approve(await pool.getAddress(), ethers.MaxUint256);

    const startA = await a.balanceOf(attacker.address);
    const outB = await pool.connect(attacker).swap.staticCall(await a.getAddress(), await b.getAddress(), amt, 1, DEADLINE);
    await pool.connect(attacker).swap(await a.getAddress(), await b.getAddress(), amt, 1, DEADLINE);
    await pool.connect(attacker).swap(await b.getAddress(), await a.getAddress(), outB, 1, DEADLINE);

    const endA = await a.balanceOf(attacker.address);
    expect(endA).to.be.lessThan(startA); // attacker ends with less than they started
  });

  it("modestly-sized balanced swap still returns close to 1:1 minus fee", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const amt = 1_000n * 10n ** 18n; // small relative to 1M pool
    const out = await pool.getQuote(await a.getAddress(), await b.getAddress(), amt);
    // ~amt minus ~4bps fee and negligible slippage.
    expect(out).to.be.greaterThan((amt * 9990n) / 10000n);
    expect(out).to.be.lessThan(amt);
  });
});
