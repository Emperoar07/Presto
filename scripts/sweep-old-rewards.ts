import hre from "hardhat";
const { ethers } = hre;

const USYC = "0x825Ae482558415310C71B7E03d2BbBe409345903";

// Superseded reward contracts (still live + funded + vulnerable). Draining
// their treasuries to the owner removes the exploitable funds.
const OLD = [
  { name: "USYCRewards (v-prev)", addr: "0x297EDe265Bbc697B409fB371386eBD6370553Dec" },
  { name: "USYCRewards (buggy)", addr: "0x3454fB11Ead7a10806434daE0A7EfFd289ABb908" },
  { name: "CirBtcRewards (buggy)", addr: "0x735C744F459f9E19E5061dA46FAe417b87Cb22B2" },
];

const ABI = [
  "function owner() view returns (address)",
  "function withdrawUsyc(uint256 amount)",
];

async function main() {
  const [me] = await ethers.getSigners();
  const usyc = await ethers.getContractAt("TestUSYC", USYC);

  for (const c of OLD) {
    const code = await ethers.provider.getCode(c.addr);
    if (code === "0x") { console.log(`- ${c.name}: no code, skip`); continue; }

    const bal = await usyc.balanceOf(c.addr);
    const ct = await ethers.getContractAt(ABI, c.addr);
    let own: string;
    try { own = await ct.owner(); } catch { own = "(none)"; }
    const mine = own.toLowerCase() === me.address.toLowerCase();

    console.log(`- ${c.name} ${c.addr}: bal=${ethers.formatUnits(bal, 6)} owner=${own} mine=${mine}`);
    if (bal === 0n) { console.log("    balance 0, nothing to sweep"); continue; }
    if (!mine) { console.log("    NOT OWNER — skipping (safe)"); continue; }

    const tx = await ct.withdrawUsyc(bal);
    await tx.wait();
    const after = await usyc.balanceOf(c.addr);
    console.log(`    swept, tx=${tx.hash}, after=${ethers.formatUnits(after, 6)}`);
  }

  console.log("deployer USYC balance now:", ethers.formatUnits(await usyc.balanceOf(me.address), 6));
}

main().catch((e) => { console.error(e); process.exit(1); });
