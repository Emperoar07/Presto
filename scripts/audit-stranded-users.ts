import hre from "hardhat";
const { ethers } = hre;

const DEPLOYER = "0x659eEAF9Be1fB881959D883385D03B0Ef5D778E0";
const HUB = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const PAIR = "0x789CA3EfC403Df1Fe58867D50EBA5C3fa0E652C8";
const OLD_CIRBTC = "0x735C744F459f9E19E5061dA46FAe417b87Cb22B2";
const NEW_CIRBTC = "0x7f404Eb83801b1E8177802EAaaC6f5981C88F9A1";

const TOKENS: Record<string, string> = {
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  USDT: "0x175CdB1D338945f0D851A741ccF787D343E57952",
  WUSDC: "0x911b4000D3422F482F4062a913885f7b035382Df",
  USYC: "0x825Ae482558415310C71B7E03d2BbBe409345903",
  cirBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
};

const HUB_ABI = [
  "function totalShares(address) view returns (uint256)",
  "function shares(address,address) view returns (uint256)",
];

async function main() {
  const hub = await ethers.getContractAt(HUB_ABI, HUB);

  console.log("=== Hub AMM LP ownership (who holds the stable LP?) ===");
  for (const [sym, addr] of Object.entries(TOKENS)) {
    const [total, mine] = await Promise.all([
      hub.totalShares(addr) as Promise<bigint>,
      hub.shares(addr, DEPLOYER) as Promise<bigint>,
    ]);
    if (total === 0n) { console.log(`${sym.padEnd(7)}: no pool`); continue; }
    const others = total - mine;
    const pctOthers = Number((others * 10000n) / total) / 100;
    console.log(
      `${sym.padEnd(7)}: total=${ethers.formatUnits(total, 18)} deployer=${ethers.formatUnits(mine, 18)} ` +
      `others=${ethers.formatUnits(others, 18)} (${pctOthers.toFixed(2)}% held by other addresses)`
    );
  }

  console.log("\n=== cirBTC staked LP custody ===");
  const pair = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], PAIR);
  const rew = ["function stakedLp(address) view returns (uint256)"];
  const oldC = await ethers.getContractAt(rew, OLD_CIRBTC);
  const oldHeld = await pair.balanceOf(OLD_CIRBTC) as bigint;
  const oldMine = await oldC.stakedLp(DEPLOYER) as bigint;
  console.log(`OLD ${OLD_CIRBTC}`);
  console.log(`  LP custodied by contract : ${ethers.formatUnits(oldHeld, 18)}`);
  console.log(`  of which deployer's stake: ${ethers.formatUnits(oldMine, 18)}`);
  console.log(`  => other stakers' LP     : ${ethers.formatUnits(oldHeld - oldMine, 18)}`);
  console.log(`NEW ${NEW_CIRBTC} LP custodied: ${ethers.formatUnits(await pair.balanceOf(NEW_CIRBTC) as bigint, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
