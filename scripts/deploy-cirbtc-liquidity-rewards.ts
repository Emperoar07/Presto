import hre from "hardhat";
const { ethers } = hre;

const USYC = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const CIRBTC = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";
const USDC = "0x3600000000000000000000000000000000000000";
const FACTORY = "0xd70dd32d5Ee254F92ed1B259B6a8c22dA5CCb754";
const ROUTER = "0x2c820034B1ccb6739d7F8E25c572Cb6Bb5ed7211";
const FUND_AMOUNT = ethers.parseUnits(process.env.CIRBTC_REWARDS_FUND_USYC ?? "100000", 6);

async function requireCode(label: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no contract code at ${address}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) throw new Error(`Expected Arc Testnet, received chain ${network.chainId}`);

  await Promise.all([
    requireCode("USYC", USYC),
    requireCode("cirBTC", CIRBTC),
    requireCode("USDC", USDC),
    requireCode("factory", FACTORY),
    requireCode("router", ROUTER),
  ]);

  const factory = await ethers.getContractAt("UniswapV2Factory", FACTORY);
  const pairAddress = await factory.getPair(CIRBTC, USDC);
  if (pairAddress === ethers.ZeroAddress) throw new Error("cirBTC and USDC pair is not deployed");
  await requireCode("pair", pairAddress);

  const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
  const [token0, token1, totalSupply, reserves, nativeBalance] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.totalSupply(),
    pair.getReserves(),
    ethers.provider.getBalance(deployer.address),
  ]);
  const pairTokens = new Set([token0.toLowerCase(), token1.toLowerCase()]);
  if (!pairTokens.has(CIRBTC.toLowerCase()) || !pairTokens.has(USDC.toLowerCase())) {
    throw new Error(`Unexpected pair tokens ${token0} and ${token1}`);
  }
  if (totalSupply === 0n || reserves[0] === 0n || reserves[1] === 0n) {
    throw new Error("cirBTC and USDC pair has no liquidity");
  }
  if (nativeBalance === 0n) throw new Error("Deployer has no Arc gas balance");

  console.log("Deployer:", deployer.address);
  console.log("Pair:", pairAddress);
  console.log("Pair total supply:", totalSupply.toString());

  const Rewards = await ethers.getContractFactory("CirBtcLiquidityRewards");
  const rewards = await Rewards.deploy(USYC, CIRBTC, USDC, pairAddress, ROUTER);
  const deployment = await rewards.deploymentTransaction();
  await rewards.waitForDeployment();
  const rewardsAddress = await rewards.getAddress();

  console.log("Deployment transaction:", deployment?.hash);
  console.log("Rewards contract:", rewardsAddress);

  const usyc = await ethers.getContractAt("TestUSYC", USYC);
  let deployerUsyc = await usyc.balanceOf(deployer.address);
  if (deployerUsyc < FUND_AMOUNT) {
    const mintAmount = FUND_AMOUNT - deployerUsyc;
    const mintTx = await usyc.mint(deployer.address, mintAmount);
    await mintTx.wait();
    console.log("USYC mint transaction:", mintTx.hash);
    deployerUsyc = await usyc.balanceOf(deployer.address);
  }
  if (deployerUsyc < FUND_AMOUNT) throw new Error("Deployer USYC balance is insufficient");

  const fundTx = await usyc.transfer(rewardsAddress, FUND_AMOUNT);
  await fundTx.wait();
  const funded = await rewards.contractBalance();
  if (funded !== FUND_AMOUNT) throw new Error(`Unexpected rewards balance ${funded}`);

  const [configuredUsyc, configuredPair, configuredRate] = await Promise.all([
    rewards.usyc(),
    rewards.pair(),
    rewards.rewardRateBps(),
  ]);
  if (configuredUsyc.toLowerCase() !== USYC.toLowerCase()) throw new Error("USYC verification failed");
  if (configuredPair.toLowerCase() !== pairAddress.toLowerCase()) throw new Error("pair verification failed");
  if (configuredRate !== 100n) throw new Error("reward rate verification failed");

  console.log("Funding transaction:", fundTx.hash);
  console.log("Funded USYC:", ethers.formatUnits(funded, 6));
  console.log(`NEXT_PUBLIC_CIRBTC_REWARDS_ADDRESS=${rewardsAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
