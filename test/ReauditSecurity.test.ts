import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

const DEADLINE = 9_999_999_999n;
const YEAR = 365n * 24n * 60n * 60n;
const RATE_BPS = 50n; // USYCRewards default
const SCALE = 10n ** 12n; // shares (18dp) -> USYC tvl (6dp)
const NINETY_DAYS = 90 * 24 * 60 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Re-audit finding #1 — USYCRewards reward inflation via un-checkpointed shares
//
// _computeAccrued must credit only min(currentShares, shares-at-checkpoint), so
// shares added AFTER a checkpoint cannot be paid for the whole elapsed window.
// ─────────────────────────────────────────────────────────────────────────────
describe("USYCRewards — un-checkpointed share inflation (re-audit #1)", function () {
  async function fixture() {
    const [deployer, attacker, honest] = await ethers.getSigners();
    const SimpleToken = await ethers.getContractFactory("SimpleToken");

    const usyc = await SimpleToken.deploy("US Yield Coin", "USYC", 6);
    const usdc = await SimpleToken.deploy("USD Coin", "USDC", 6); // pathUSD
    const eurc = await SimpleToken.deploy("Euro Coin", "EURC", 6);

    const Amm = await ethers.getContractFactory("ArcHubAMMNormalized");
    const amm = await Amm.deploy(await usdc.getAddress());

    const Rewards = await ethers.getContractFactory("USYCRewards");
    const rewards = await Rewards.deploy(await usyc.getAddress(), await amm.getAddress());

    const eurcAddr = await eurc.getAddress();
    await rewards.setPoolEnabled(eurcAddr, true);
    await usyc.mint(await rewards.getAddress(), ethers.parseUnits("4000000", 6));

    const ammAddr = await amm.getAddress();
    const usdcAddr = await usdc.getAddress();

    async function addLiquidity(who: any, eurcAmount: bigint) {
      // Hub pairs userToken with an equal-value slice of pathUSD; fund both sides.
      await eurc.mint(who.address, eurcAmount);
      await usdc.mint(who.address, eurcAmount);
      await eurc.connect(who).approve(ammAddr, eurcAmount);
      await usdc.connect(who).approve(ammAddr, eurcAmount);
      await amm.connect(who).addLiquidity(eurcAddr, usdcAddr, eurcAmount, DEADLINE);
    }

    return { rewards, amm, eurc, usdc, usyc, eurcAddr, attacker, honest, deployer, addLiquidity };
  }

  it("zero-capital wait then large deposit earns nothing for the wait", async function () {
    const { rewards, amm, eurcAddr, attacker, addLiquidity } = await loadFixture(fixture);

    // Checkpoint with ZERO shares, then wait 90 days with no capital locked.
    await rewards.connect(attacker).snapshot(attacker.address, eurcAddr);
    await time.increase(NINETY_DAYS);

    // Add a large position without re-snapshotting, then try to harvest.
    await addLiquidity(attacker, ethers.parseUnits("500000", 6));
    const sharesNow = await amm.shares(eurcAddr, attacker.address);
    expect(sharesNow).to.be.greaterThan(0n);

    // min(current, snapshot=0) == 0 -> the wait paid nothing.
    expect(await rewards.claimableOf(attacker.address, eurcAddr)).to.equal(0n);
    await expect(rewards.connect(attacker).claim(eurcAddr)).to.be.revertedWith("nothing to claim");
  });

  it("amplifying a tiny checkpoint with a later large deposit only pays the tiny size", async function () {
    const { rewards, amm, eurcAddr, attacker, addLiquidity } = await loadFixture(fixture);

    // Checkpoint holding a tiny position.
    await addLiquidity(attacker, ethers.parseUnits("1", 6));
    await rewards.connect(attacker).snapshot(attacker.address, eurcAddr);
    const tinyShares = await amm.shares(eurcAddr, attacker.address);

    await time.increase(NINETY_DAYS);

    // Amplify: add a huge position, do NOT re-snapshot, then read claimable.
    await addLiquidity(attacker, ethers.parseUnits("500000", 6));
    const hugeShares = await amm.shares(eurcAddr, attacker.address);
    expect(hugeShares).to.be.greaterThan(tinyShares * 1000n);

    const claimable = await rewards.claimableOf(attacker.address, eurcAddr);
    const elapsed = BigInt(await time.latest()) - (await rewards.lastSnapshot(attacker.address, eurcAddr));
    const expectedTiny = ((tinyShares * 2n / SCALE) * RATE_BPS * elapsed) / (10000n * YEAR);
    const wouldBeHuge = ((hugeShares * 2n / SCALE) * RATE_BPS * elapsed) / (10000n * YEAR);

    // Paid on the tiny checkpoint size, nowhere near the amplified size.
    expect(claimable).to.be.closeTo(expectedTiny, expectedTiny / 100n + 10n);
    expect(claimable * 100n).to.be.lessThan(wouldBeHuge);
  });

  it("an honest LP that holds its checkpointed size still earns the full amount", async function () {
    const { rewards, amm, eurcAddr, honest, addLiquidity } = await loadFixture(fixture);

    await addLiquidity(honest, ethers.parseUnits("10000", 6));
    await rewards.connect(honest).snapshot(honest.address, eurcAddr);
    const heldShares = await amm.shares(eurcAddr, honest.address);

    await time.increase(NINETY_DAYS);

    const claimable = await rewards.claimableOf(honest.address, eurcAddr);
    const elapsed = BigInt(await time.latest()) - (await rewards.lastSnapshot(honest.address, eurcAddr));
    const expected = ((heldShares * 2n / SCALE) * RATE_BPS * elapsed) / (10000n * YEAR);
    expect(claimable).to.be.closeTo(expected, expected / 1000n + 10n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Re-audit finding #3 — ArcStableSwapPool LP accounting must track D, not the
// raw sum of balances, so imbalanced add + remove can't beat a taxed swap and
// LP value never drops.
// ─────────────────────────────────────────────────────────────────────────────
describe("ArcStableSwapPool — D-based LP accounting (re-audit #3)", function () {
  async function fixture() {
    const SimpleToken = await ethers.getContractFactory("SimpleToken");
    const [owner, attacker] = await ethers.getSigners();

    const a = await SimpleToken.deploy("USDC", "USDC", 18);
    const b = await SimpleToken.deploy("USDT", "USDT", 18);

    const Pool = await ethers.getContractFactory("ArcStableSwapPool");
    const pool = await Pool.deploy([await a.getAddress(), await b.getAddress()], 200, 4);

    const liq = 1_000_000n * 10n ** 18n;
    await a.mint(owner.address, liq);
    await b.mint(owner.address, liq);
    await a.approve(await pool.getAddress(), liq);
    await b.approve(await pool.getAddress(), liq);
    await pool.addLiquidity([liq, liq], 1, DEADLINE);

    return { pool, a, b, owner, attacker };
  }

  it("imbalanced add + balanced remove round-trips at a loss (no fee-light rebalance)", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const addr = await pool.getAddress();
    const aAddr = await a.getAddress();

    const amountIn = 100_000n * 10n ** 18n; // deposit token A only
    await a.mint(attacker.address, amountIn);
    await a.connect(attacker).approve(addr, amountIn);

    const lpOut = await pool.connect(attacker).addLiquidity.staticCall([amountIn, 0n], 1, DEADLINE);
    await pool.connect(attacker).addLiquidity([amountIn, 0n], 1, DEADLINE);

    const beforeA = await a.balanceOf(attacker.address);
    const beforeB = await b.balanceOf(attacker.address);
    await pool.connect(attacker).removeLiquidity(lpOut, [1n, 1n], DEADLINE);
    const outA = (await a.balanceOf(attacker.address)) - beforeA;
    const outB = (await b.balanceOf(attacker.address)) - beforeB;

    // Value out (A+B, both ~$1) must be strictly less than the value put in.
    expect(outA + outB).to.be.lessThan(amountIn);
    // ...but only by the imbalance fee band, not a wild loss.
    expect(outA + outB).to.be.greaterThan((amountIn * 995n) / 1000n);
  });

  it("virtual price never decreases across imbalanced add and single-coin remove", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const addr = await pool.getAddress();

    const vp0 = await pool.getVirtualPrice();

    const amountIn = 200_000n * 10n ** 18n;
    await a.mint(attacker.address, amountIn);
    await a.connect(attacker).approve(addr, amountIn);
    const lpOut = await pool.connect(attacker).addLiquidity.staticCall([amountIn, 0n], 1, DEADLINE);
    await pool.connect(attacker).addLiquidity([amountIn, 0n], 1, DEADLINE);

    const vp1 = await pool.getVirtualPrice();
    expect(vp1).to.be.greaterThanOrEqual(vp0);

    await pool.connect(attacker).removeLiquidityOneToken(lpOut, await b.getAddress(), 1n, DEADLINE);
    const vp2 = await pool.getVirtualPrice();
    expect(vp2).to.be.greaterThanOrEqual(vp1);
  });

  it("single-coin withdrawal is priced with slippage, not a raw reserve slice", async function () {
    const { pool, a, b, attacker } = await loadFixture(fixture);
    const addr = await pool.getAddress();

    // Deposit balanced, then exit entirely into one coin.
    const each = 300_000n * 10n ** 18n;
    await a.mint(attacker.address, each);
    await b.mint(attacker.address, each);
    await a.connect(attacker).approve(addr, each);
    await b.connect(attacker).approve(addr, each);
    const lpOut = await pool.connect(attacker).addLiquidity.staticCall([each, each], 1, DEADLINE);
    await pool.connect(attacker).addLiquidity([each, each], 1, DEADLINE);

    const beforeA = await a.balanceOf(attacker.address);
    await pool.connect(attacker).removeLiquidityOneToken(lpOut, await a.getAddress(), 1n, DEADLINE);
    const outA = (await a.balanceOf(attacker.address)) - beforeA;

    // Deposited 600k of value; taking it all in one coin costs stableswap
    // slippage, so out < the 600k deposited and clearly less than a raw
    // proportional slice of the (now ~1.3M) A reserve would have paid.
    expect(outA).to.be.lessThan(2n * each);
    expect(outA).to.be.greaterThan((2n * each * 90n) / 100n); // but a sane, near-fair amount
  });
});
