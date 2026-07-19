import hre from "hardhat";
const { ethers } = hre;

const REWARDS = "0x735C744F459f9E19E5061dA46FAe417b87Cb22B2";
const PAIR = "0x789CA3EfC403Df1Fe58867D50EBA5C3fa0E652C8";
const USYC = "0x825Ae482558415310C71B7E03d2BbBe409345903";
const TARGET_PRINCIPAL = ethers.parseUnits("2000", 6);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const [provider] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) throw new Error(`Expected Arc Testnet, received ${network.chainId}`);

  const rewards = await ethers.getContractAt("CirBtcLiquidityRewards", REWARDS);
  const pair = await ethers.getContractAt("UniswapV2Pair", PAIR);
  const usyc = await ethers.getContractAt("TestUSYC", USYC);
  const [configuredPair, configuredUsyc, rate, principalPerLp, walletLp] = await Promise.all([
    rewards.pair(),
    rewards.usyc(),
    rewards.rewardRateBps(),
    rewards.principalPerLpX18(),
    pair.balanceOf(provider.address),
  ]);
  if (configuredPair.toLowerCase() !== PAIR.toLowerCase()) throw new Error("pair verification failed");
  if (configuredUsyc.toLowerCase() !== USYC.toLowerCase()) throw new Error("USYC verification failed");
  if (rate !== 100n) throw new Error("reward rate verification failed");
  if (walletLp === 0n) throw new Error("Deployer has no wallet LP to activate");

  const targetLp = (TARGET_PRINCIPAL * 10n ** 18n + principalPerLp - 1n) / principalPerLp;
  const activationAmount = targetLp < walletLp ? targetLp : walletLp;
  const nonce = await pair.nonces(provider.address);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const signature = ethers.Signature.from(await provider.signTypedData(
    { name: "Tempo LPs", version: "1", chainId: 5042002, verifyingContract: PAIR },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { owner: provider.address, spender: REWARDS, value: activationAmount, nonce, deadline },
  ));

  const activateTx = await rewards.activateWithPermit(
    activationAmount,
    deadline,
    signature.v,
    signature.r,
    signature.s,
  );
  await activateTx.wait();
  const activated = await rewards.stakedLp(provider.address);
  if (activated < activationAmount) throw new Error("activated LP verification failed");
  console.log("Activation transaction:", activateTx.hash);
  console.log("Activated LP:", activationAmount.toString());

  let claimable = 0n;
  for (let attempt = 0; attempt < 30 && claimable === 0n; attempt += 1) {
    await wait(2_000);
    claimable = await rewards.claimableOf(provider.address);
  }
  if (claimable === 0n) throw new Error("reward did not accrue during smoke window");

  const usycBefore = await usyc.balanceOf(provider.address);
  const claimTx = await rewards.claim();
  await claimTx.wait();
  const usycAfter = await usyc.balanceOf(provider.address);
  if (usycAfter <= usycBefore) throw new Error("USYC claim verification failed");
  console.log("Claim transaction:", claimTx.hash);
  console.log("Claimed USYC raw:", (usycAfter - usycBefore).toString());

  const removeAmount = activationAmount > 1000n ? activationAmount / 1000n : 1n;
  const removeTx = await rewards.removeLiquidity(
    removeAmount,
    0,
    0,
    BigInt(Math.floor(Date.now() / 1000) + 1200),
  );
  await removeTx.wait();
  const stakedAfter = await rewards.stakedLp(provider.address);
  if (stakedAfter !== activated - removeAmount) throw new Error("rewarded removal verification failed");
  console.log("Removal transaction:", removeTx.hash);
  console.log("Remaining activated LP:", stakedAfter.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
