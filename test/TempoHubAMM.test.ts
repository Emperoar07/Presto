import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployFixture,
  addLiquidityHelper,
  swapHelper,
  calculateExpectedOutput,
  parseTokens,
  formatTokens,
  getCurrentTimestamp,
} from "./helpers.ts";

describe("TempoHubAMM - Unit Tests", function () {
  describe("Deployment", function () {
    it("Should deploy with correct pathUSD address", async function () {
      const { amm, tokens } = await loadFixture(deployFixture);
      expect(await amm.pathUSD()).to.equal(await tokens.pathUSD.getAddress());
    });

    it("Should revert if pathUSD is zero address", async function () {
      const TempoHubAMM = await ethers.getContractFactory("TempoHubAMM");
      await expect(
        TempoHubAMM.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid pathUSD address");
    });

    it("Should set the deployer as owner", async function () {
      const { amm, owner } = await loadFixture(deployFixture);
      expect(await amm.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero reserves", async function () {
      const { amm, tokens } = await loadFixture(deployFixture);
      const alphaAddress = await tokens.alphaUSD.getAddress();

      expect(await amm.tokenReserves(alphaAddress)).to.equal(0);
      expect(await amm.pathReserves(alphaAddress)).to.equal(0);
      expect(await amm.totalShares(alphaAddress)).to.equal(0);
    });

    it("Should not be paused on deployment", async function () {
      const { amm } = await loadFixture(deployFixture);
      expect(await amm.paused()).to.equal(false);
    });
  });

  describe("Add Liquidity", function () {
    it("Should add initial liquidity with 1:1 ratio", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(
        amm,
        tokens.alphaUSD,
        tokens.pathUSD,
        user1,
        amount,
        amount
      );

      const alphaAddress = await tokens.alphaUSD.getAddress();
      expect(await amm.tokenReserves(alphaAddress)).to.equal(amount);
      expect(await amm.pathReserves(alphaAddress)).to.equal(amount);
      expect(shares).to.be.gt(0);
    });

    it("Should lock minimum liquidity on first deposit", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(
        amm,
        tokens.alphaUSD,
        tokens.pathUSD,
        user1,
        amount,
        amount
      );

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const minimumLiquidity = 1000n;

      // Check that minimum liquidity is locked
      expect(await amm.shares(alphaAddress, ethers.ZeroAddress)).to.equal(minimumLiquidity);

      // User should receive total - minimum
      const expectedShares = ethers.parseUnits("10000", 18) - minimumLiquidity;
      expect(await amm.shares(alphaAddress, user1.address)).to.equal(expectedShares);
    });

    it("Should emit MinimumLiquidityLocked event on first deposit", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("10000", 18);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();

      // Mint and approve
      await tokens.alphaUSD.mint(user1.address, amount);
      await tokens.pathUSD.mint(user1.address, amount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);
      await tokens.pathUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).addLiquidity(alphaAddress, pathAddress, amount, deadline)
      )
        .to.emit(amm, "MinimumLiquidityLocked")
        .withArgs(alphaAddress, 1000n);
    });

    it("Should maintain pool ratio on subsequent liquidity additions", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      // First provider: 10000 : 10000
      const amount1 = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount1, amount1);

      // Second provider: add 5000 : 5000
      const amount2 = parseTokens("5000", 18);
      const shares2 = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user2, amount2, amount2);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      expect(await amm.tokenReserves(alphaAddress)).to.equal(amount1 + amount2);
      expect(await amm.pathReserves(alphaAddress)).to.equal(amount1 + amount2);
      expect(shares2).to.be.gt(0);
    });

    it("Should revert if adding liquidity with zero amount", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.alphaUSD.getAddress(),
          await tokens.pathUSD.getAddress(),
          0,
          deadline
        )
      ).to.be.revertedWith("Zero amount");
    });

    it("Should revert if validatorToken is not pathUSD", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("1000", 18);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.alphaUSD.getAddress(),
          await tokens.betaUSD.getAddress(), // Wrong validator
          amount,
          deadline
        )
      ).to.be.revertedWith("Validator token must be pathUSD");
    });

    it("Should revert if userToken is pathUSD", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("1000", 18);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.pathUSD.getAddress(), // pathUSD as user token
          await tokens.pathUSD.getAddress(),
          amount,
          deadline
        )
      ).to.be.revertedWith("User token cannot be pathUSD");
    });

    it("Should revert if deadline has passed", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("1000", 18);
      const pastDeadline = BigInt(await getCurrentTimestamp()) - 100n;

      // Mint and approve
      await tokens.alphaUSD.mint(user1.address, amount);
      await tokens.pathUSD.mint(user1.address, amount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);
      await tokens.pathUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.alphaUSD.getAddress(),
          await tokens.pathUSD.getAddress(),
          amount,
          pastDeadline
        )
      ).to.be.revertedWith("Transaction expired");
    });

    it("Should revert when paused", async function () {
      const { amm, tokens, user1, owner } = await loadFixture(deployFixture);
      const amount = parseTokens("1000", 18);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      // Pause the contract
      await amm.connect(owner).pause();

      // Mint and approve
      await tokens.alphaUSD.mint(user1.address, amount);
      await tokens.pathUSD.mint(user1.address, amount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);
      await tokens.pathUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.alphaUSD.getAddress(),
          await tokens.pathUSD.getAddress(),
          amount,
          deadline
        )
      ).to.be.revertedWithCustomError(amm, "EnforcedPause");
    });

    it("Should emit LiquidityAdded event with correct parameters", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("10000", 18);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();

      // Mint and approve
      await tokens.alphaUSD.mint(user1.address, amount);
      await tokens.pathUSD.mint(user1.address, amount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);
      await tokens.pathUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).addLiquidity(alphaAddress, pathAddress, amount, deadline)
      )
        .to.emit(amm, "LiquidityAdded")
        .withArgs(user1.address, alphaAddress, amount, amount, amount - 1000n);
    });

    it("Should revert if insufficient initial liquidity", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const tinyAmount = 100n; // Less than MINIMUM_LIQUIDITY
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await tokens.alphaUSD.mint(user1.address, tinyAmount);
      await tokens.pathUSD.mint(user1.address, tinyAmount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);
      await tokens.pathUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).addLiquidity(
          await tokens.alphaUSD.getAddress(),
          await tokens.pathUSD.getAddress(),
          tinyAmount,
          deadline
        )
      ).to.be.revertedWith("Insufficient initial liquidity");
    });
  });

  describe("Remove Liquidity", function () {
    it("Should remove liquidity proportionally", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      // Add liquidity
      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      // Remove half the shares
      const sharesToRemove = shares / 2n;
      const tx = await amm.connect(user1).removeLiquidity(
        alphaAddress,
        pathAddress,
        sharesToRemove,
        0,
        0,
        deadline
      );

      // Check reserves decreased
      expect(await amm.tokenReserves(alphaAddress)).to.be.lt(amount);
      expect(await amm.pathReserves(alphaAddress)).to.be.lt(amount);
    });

    it("Should enforce slippage protection on removal", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      // Try to remove with unrealistic minimums
      await expect(
        amm.connect(user1).removeLiquidity(
          alphaAddress,
          pathAddress,
          shares,
          parseTokens("100000", 18), // Too high
          parseTokens("100000", 18), // Too high
          deadline
        )
      ).to.be.revertedWith("Slippage tolerance exceeded");
    });

    it("Should revert if removing more shares than owned", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).removeLiquidity(
          alphaAddress,
          pathAddress,
          shares + 1000n, // More than owned
          0,
          0,
          deadline
        )
      ).to.be.revertedWith("Insufficient shares");
    });

    it("Should revert if deadline has passed", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const pastDeadline = BigInt(await getCurrentTimestamp()) - 100n;

      await expect(
        amm.connect(user1).removeLiquidity(
          alphaAddress,
          pathAddress,
          shares,
          0,
          0,
          pastDeadline
        )
      ).to.be.revertedWith("Transaction expired");
    });

    it("Should work even when paused (emergency withdrawal)", async function () {
      const { amm, tokens, user1, owner } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      // Pause the contract
      await amm.connect(owner).pause();

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      // Should still be able to remove liquidity
      await expect(
        amm.connect(user1).removeLiquidity(
          alphaAddress,
          pathAddress,
          shares,
          0,
          0,
          deadline
        )
      ).to.not.be.reverted;
    });

    it("Should emit LiquidityRemoved event", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);

      const amount = parseTokens("10000", 18);
      const shares = await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, amount, amount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).removeLiquidity(
          alphaAddress,
          pathAddress,
          shares,
          0,
          0,
          deadline
        )
      ).to.emit(amm, "LiquidityRemoved");
    });
  });

  describe("Swap - Direct (pathUSD <-> Token)", function () {
    it("Should swap pathUSD for Token", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      // Add liquidity
      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      // Swap
      const swapAmount = parseTokens("100", 18);
      const amountOut = await swapHelper(
        amm,
        tokens.pathUSD,
        tokens.alphaUSD,
        user2,
        swapAmount
      );

      expect(amountOut).to.be.gt(0);
      expect(amountOut).to.be.lt(swapAmount); // Due to fees
    });

    it("Should swap Token for pathUSD", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      // Add liquidity
      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      // Swap
      const swapAmount = parseTokens("100", 18);
      const amountOut = await swapHelper(
        amm,
        tokens.alphaUSD,
        tokens.pathUSD,
        user2,
        swapAmount
      );

      expect(amountOut).to.be.gt(0);
      expect(amountOut).to.be.lt(swapAmount); // Due to fees
    });

    it("Should apply 0.3% fee correctly", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();

      // Get quote
      const quote = await amm.getQuote(pathAddress, alphaAddress, swapAmount);

      // Calculate expected using Uniswap V2 formula
      const expected = calculateExpectedOutput(swapAmount, liquidityAmount, liquidityAmount);

      expect(quote).to.equal(expected);
    });

    it("Should update reserves after swap", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const reservesBefore = await amm.tokenReserves(alphaAddress);

      const swapAmount = parseTokens("100", 18);
      await swapHelper(amm, tokens.pathUSD, tokens.alphaUSD, user2, swapAmount);

      const reservesAfter = await amm.tokenReserves(alphaAddress);
      expect(reservesAfter).to.be.lt(reservesBefore);
    });
  });

  describe("Swap - Multi-hop (Token A <-> Token B)", function () {
    it("Should swap Token A for Token B through pathUSD", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      // Add liquidity to both pools
      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);
      await addLiquidityHelper(amm, tokens.betaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      // Swap Alpha for Beta
      const swapAmount = parseTokens("100", 18);
      const amountOut = await swapHelper(
        amm,
        tokens.alphaUSD,
        tokens.betaUSD,
        user2,
        swapAmount
      );

      expect(amountOut).to.be.gt(0);
    });

    it("Should compound fees in multi-hop swaps", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);
      await addLiquidityHelper(amm, tokens.betaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);

      // Multi-hop quote
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const betaAddress = await tokens.betaUSD.getAddress();
      const multiHopQuote = await amm.getQuote(alphaAddress, betaAddress, swapAmount);

      // Calculate manually: Alpha -> pathUSD -> Beta
      const pathAmount = calculateExpectedOutput(swapAmount, liquidityAmount, liquidityAmount);
      const betaAmount = calculateExpectedOutput(pathAmount, liquidityAmount, liquidityAmount);

      expect(multiHopQuote).to.equal(betaAmount);
    });

    it("Should respect slippage in multi-hop swaps", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);
      await addLiquidityHelper(amm, tokens.betaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const betaAddress = await tokens.betaUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      // Mint and approve
      await tokens.alphaUSD.mint(user2.address, swapAmount);
      await tokens.alphaUSD.connect(user2).approve(await amm.getAddress(), ethers.MaxUint256);

      // Try with unrealistic minimum
      await expect(
        amm.connect(user2).swap(
          alphaAddress,
          betaAddress,
          swapAmount,
          parseTokens("1000", 18), // Too high
          deadline
        )
      ).to.be.revertedWith("Slippage tolerance exceeded");
    });
  });

  describe("Swap - Edge Cases", function () {
    it("Should revert when swapping same token", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const amount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await tokens.alphaUSD.mint(user1.address, amount);
      await tokens.alphaUSD.connect(user1).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user1).swap(alphaAddress, alphaAddress, amount, 0, deadline)
      ).to.be.revertedWith("Same token");
    });

    it("Should revert with zero amount", async function () {
      const { amm, tokens, user1 } = await loadFixture(deployFixture);
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await expect(
        amm.connect(user1).swap(
          await tokens.alphaUSD.getAddress(),
          await tokens.betaUSD.getAddress(),
          0,
          0,
          deadline
        )
      ).to.be.revertedWith("Zero amount");
    });

    it("Should revert with insufficient liquidity", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      // Add small liquidity
      const liquidityAmount = parseTokens("100", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      // Try to swap more than available
      const hugeSwap = parseTokens("1000", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await tokens.pathUSD.mint(user2.address, hugeSwap);
      await tokens.pathUSD.connect(user2).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user2).swap(pathAddress, alphaAddress, hugeSwap, 0, deadline)
      ).to.be.revertedWith("Insufficient liquidity");
    });

    it("Should revert when paused", async function () {
      const { amm, tokens, user1, user2, owner } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      // Pause
      await amm.connect(owner).pause();

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await tokens.pathUSD.mint(user2.address, swapAmount);
      await tokens.pathUSD.connect(user2).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user2).swap(pathAddress, alphaAddress, swapAmount, 0, deadline)
      ).to.be.revertedWithCustomError(amm, "EnforcedPause");
    });

    it("Should revert if deadline expired", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const pastDeadline = BigInt(await getCurrentTimestamp()) - 100n;

      await tokens.pathUSD.mint(user2.address, swapAmount);
      await tokens.pathUSD.connect(user2).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user2).swap(pathAddress, alphaAddress, swapAmount, 0, pastDeadline)
      ).to.be.revertedWith("Transaction expired");
    });

    it("Should emit Swap event", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();
      const deadline = BigInt(await getCurrentTimestamp()) + 1800n;

      await tokens.pathUSD.mint(user2.address, swapAmount);
      await tokens.pathUSD.connect(user2).approve(await amm.getAddress(), ethers.MaxUint256);

      await expect(
        amm.connect(user2).swap(pathAddress, alphaAddress, swapAmount, 0, deadline)
      ).to.emit(amm, "Swap");
    });
  });

  describe("getQuote", function () {
    it("Should return 0 for zero input", async function () {
      const { amm, tokens } = await loadFixture(deployFixture);

      const quote = await amm.getQuote(
        await tokens.pathUSD.getAddress(),
        await tokens.alphaUSD.getAddress(),
        0
      );

      expect(quote).to.equal(0);
    });

    it("Should return input amount for same token", async function () {
      const { amm, tokens } = await loadFixture(deployFixture);
      const amount = parseTokens("100", 18);

      const alphaAddress = await tokens.alphaUSD.getAddress();
      const quote = await amm.getQuote(alphaAddress, alphaAddress, amount);

      expect(quote).to.equal(amount);
    });

    it("Should match actual swap output", async function () {
      const { amm, tokens, user1, user2 } = await loadFixture(deployFixture);

      const liquidityAmount = parseTokens("10000", 18);
      await addLiquidityHelper(amm, tokens.alphaUSD, tokens.pathUSD, user1, liquidityAmount, liquidityAmount);

      const swapAmount = parseTokens("100", 18);
      const alphaAddress = await tokens.alphaUSD.getAddress();
      const pathAddress = await tokens.pathUSD.getAddress();

      const quote = await amm.getQuote(pathAddress, alphaAddress, swapAmount);
      const actualOutput = await swapHelper(amm, tokens.pathUSD, tokens.alphaUSD, user2, swapAmount);

      expect(actualOutput).to.equal(quote);
    });
  });

  describe("Pause Mechanism", function () {
    it("Should allow owner to pause", async function () {
      const { amm, owner } = await loadFixture(deployFixture);

      await amm.connect(owner).pause();
      expect(await amm.paused()).to.equal(true);
    });

    it("Should allow owner to unpause", async function () {
      const { amm, owner } = await loadFixture(deployFixture);

      await amm.connect(owner).pause();
      await amm.connect(owner).unpause();
      expect(await amm.paused()).to.equal(false);
    });

    it("Should emit EmergencyPause event", async function () {
      const { amm, owner } = await loadFixture(deployFixture);

      await expect(amm.connect(owner).pause())
        .to.emit(amm, "EmergencyPause")
        .withArgs(owner.address, await getCurrentTimestamp());
    });

    it("Should emit EmergencyUnpause event", async function () {
      const { amm, owner } = await loadFixture(deployFixture);

      await amm.connect(owner).pause();
      await expect(amm.connect(owner).unpause())
        .to.emit(amm, "EmergencyUnpause");
    });

    it("Should revert if non-owner tries to pause", async function () {
      const { amm, user1 } = await loadFixture(deployFixture);

      await expect(
        amm.connect(user1).pause()
      ).to.be.revertedWithCustomError(amm, "OwnableUnauthorizedAccount");
    });

    it("Should revert if non-owner tries to unpause", async function () {
      const { amm, owner, user1 } = await loadFixture(deployFixture);

      await amm.connect(owner).pause();

      await expect(
        amm.connect(user1).unpause()
      ).to.be.revertedWithCustomError(amm, "OwnableUnauthorizedAccount");
    });
  });
});
