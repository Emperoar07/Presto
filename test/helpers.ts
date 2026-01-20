import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers.js";

export interface TestTokens {
  pathUSD: Contract;
  alphaUSD: Contract;
  betaUSD: Contract;
  thetaUSD: Contract;
}

export interface DeploymentFixture {
  amm: Contract;
  tokens: TestTokens;
  owner: SignerWithAddress;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  user3: SignerWithAddress;
}

/**
 * Deploy mock ERC20 tokens for testing
 */
export async function deployTokens(): Promise<TestTokens> {
  const SimpleToken = await ethers.getContractFactory("SimpleToken");

  const pathUSD = await SimpleToken.deploy("Path USD", "pathUSD", 18);
  await pathUSD.waitForDeployment();

  const alphaUSD = await SimpleToken.deploy("Alpha USD", "AlphaUSD", 18);
  await alphaUSD.waitForDeployment();

  const betaUSD = await SimpleToken.deploy("Beta USD", "BetaUSD", 18);
  await betaUSD.waitForDeployment();

  const thetaUSD = await SimpleToken.deploy("Theta USD", "ThetaUSD", 18);
  await thetaUSD.waitForDeployment();

  return { pathUSD, alphaUSD, betaUSD, thetaUSD };
}

/**
 * Main deployment fixture - deploys AMM and tokens
 */
export async function deployFixture(): Promise<DeploymentFixture> {
  const [owner, user1, user2, user3] = await ethers.getSigners();

  // Deploy tokens
  const tokens = await deployTokens();

  // Deploy AMM
  const TempoHubAMM = await ethers.getContractFactory("TempoHubAMM");
  const amm = await TempoHubAMM.deploy(await tokens.pathUSD.getAddress());
  await amm.waitForDeployment();

  return { amm, tokens, owner, user1, user2, user3 };
}

/**
 * Add liquidity helper - mints tokens, approves, and adds liquidity
 */
export async function addLiquidityHelper(
  amm: Contract,
  userToken: Contract,
  pathUSD: Contract,
  signer: SignerWithAddress,
  userAmount: bigint,
  pathAmount: bigint,
  deadline?: bigint
): Promise<bigint> {
  const ammAddress = await amm.getAddress();
  const userTokenAddress = await userToken.getAddress();
  const pathUSDAddress = await pathUSD.getAddress();

  // Mint tokens
  await userToken.mint(signer.address, userAmount);
  await pathUSD.mint(signer.address, pathAmount);

  // Approve tokens
  await userToken.connect(signer).approve(ammAddress, ethers.MaxUint256);
  await pathUSD.connect(signer).approve(ammAddress, ethers.MaxUint256);

  // Add liquidity
  const deadlineValue = deadline || (BigInt(Math.floor(Date.now() / 1000)) + 1800n);
  const tx = await amm.connect(signer).addLiquidity(
    userTokenAddress,
    pathUSDAddress,
    userAmount,
    deadlineValue
  );
  const receipt = await tx.wait();

  // Extract shares from event
  const event = receipt.logs.find((log: any) => {
    try {
      const parsed = amm.interface.parseLog(log);
      return parsed?.name === "LiquidityAdded";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = amm.interface.parseLog(event);
    return parsed?.args.shares || 0n;
  }

  return 0n;
}

/**
 * Execute swap helper - mints tokens, approves, and executes swap
 */
export async function swapHelper(
  amm: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  signer: SignerWithAddress,
  amountIn: bigint,
  minAmountOut: bigint = 0n,
  deadline?: bigint
): Promise<bigint> {
  const ammAddress = await amm.getAddress();
  const tokenInAddress = await tokenIn.getAddress();
  const tokenOutAddress = await tokenOut.getAddress();

  // Mint and approve input token
  await tokenIn.mint(signer.address, amountIn);
  await tokenIn.connect(signer).approve(ammAddress, ethers.MaxUint256);

  // Execute swap
  const deadlineValue = deadline || (BigInt(Math.floor(Date.now() / 1000)) + 1800n);
  const tx = await amm.connect(signer).swap(
    tokenInAddress,
    tokenOutAddress,
    amountIn,
    minAmountOut,
    deadlineValue
  );
  const receipt = await tx.wait();

  // Extract amountOut from event
  const event = receipt.logs.find((log: any) => {
    try {
      const parsed = amm.interface.parseLog(log);
      return parsed?.name === "Swap";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = amm.interface.parseLog(event);
    return parsed?.args.amountOut || 0n;
  }

  return 0n;
}

/**
 * Calculate expected output using Uniswap V2 formula
 */
export function calculateExpectedOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;

  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 1000n) + amountInWithFee;

  return numerator / denominator;
}

/**
 * Calculate price impact percentage (as basis points)
 */
export function calculatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  if (reserveIn === 0n || reserveOut === 0n) return 0;

  const priceBeforeNum = reserveOut * 10000n;
  const priceBeforeDenom = reserveIn;
  const priceBefore = priceBeforeNum / priceBeforeDenom;

  const newReserveIn = reserveIn + amountIn;
  const amountOut = calculateExpectedOutput(amountIn, reserveIn, reserveOut);
  const newReserveOut = reserveOut - amountOut;

  const priceAfterNum = newReserveOut * 10000n;
  const priceAfterDenom = newReserveIn;
  const priceAfter = priceAfterNum / priceAfterDenom;

  const impact = Number(priceBefore - priceAfter) * 10000 / Number(priceBefore);
  return Math.abs(impact);
}

/**
 * Expect transaction to revert with specific message
 */
export async function expectRevert(
  promise: Promise<any>,
  errorMessage: string
) {
  await expect(promise).to.be.revertedWith(errorMessage);
}

/**
 * Expect slippage protection to trigger
 */
export async function expectSlippageRevert(promise: Promise<any>) {
  await expectRevert(promise, "Slippage tolerance exceeded");
}

/**
 * Fast forward time in the test environment
 */
export async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Get current block timestamp
 */
export async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block?.timestamp || 0;
}

/**
 * Parse units with decimals
 */
export function parseTokens(amount: string, decimals: number = 18): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Format units with decimals
 */
export function formatTokens(amount: bigint, decimals: number = 18): string {
  return ethers.formatUnits(amount, decimals);
}
