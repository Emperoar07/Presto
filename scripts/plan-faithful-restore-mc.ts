import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

/**
 * DRY RUN — sends no transactions.
 *
 * Multicall3-based faithful restore planner. Reads data/lp-providers.json (from
 * the LiquidityAdded sweep) and narrows it in stages so we never do expensive
 * work on addresses that lost nothing:
 *
 *   stage 1: lastSnapshot(user,token) on OLD  != 0   (never snapshotted -> lost nothing)
 *   stage 2: claimableOf(user,token) on OLD    > 0   (the actual debt)
 *   stage 3: hub shares + NEW lastSnapshot     (can we backdate, or must we transfer?)
 *
 * Then solves the new contract's accrual for the backdate timestamp:
 *   elapsed = lost * 1e4 * YEAR / (tvl * rate)
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const HUB = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const OLD = "0x3454fB11Ead7a10806434daE0A7EfFd289ABb908";
const NEW = "0xc4F909a6BACF1485fa67cB9d69CDe0Bd3Ce1FA44";
const YEAR = 365n * 24n * 60n * 60n;
const BATCH = 400;
const GAS_PER_ENTRY = 45_000n;

const CACHE = "data/lp-providers.json";
const OUT = "data/faithful-restore-plan.json";

const rewIface = new ethers.Interface([
  "function lastSnapshot(address,address) view returns (uint256)",
  "function claimableOf(address user, address token) view returns (uint256)",
  "function rewardRate(address token) view returns (uint256)",
  "function poolEnabled(address) view returns (bool)",
]);
const hubIface = new ethers.Interface(["function shares(address,address) view returns (uint256)"]);

type Call = { target: string; allowFailure: boolean; callData: string };

async function aggregate(mc: any, calls: Call[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    const slice = calls.slice(i, i + BATCH);
    let res: any = null;
    for (let attempt = 1; attempt <= 5 && res === null; attempt++) {
      try { res = await mc.aggregate3(slice); }
      catch (e: any) {
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    for (const r of res) out.push(r[0] ? r[1] : null);
    if ((i / BATCH) % 20 === 0) console.log(`    ...${Math.min(i + BATCH, calls.length)}/${calls.length}`);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(CACHE)) { console.error(`missing ${CACHE} — run the sweep first`); process.exit(1); }
  const pairs: string[] = JSON.parse(fs.readFileSync(CACHE, "utf8")).pairs;
  console.log(`loaded ${pairs.length} (provider, token) pairs`);

  const mc = await ethers.getContractAt(
    ["function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"],
    MULTICALL3
  );
  const latest = await ethers.provider.getBlockNumber();
  const now = BigInt((await ethers.provider.getBlock(latest))!.timestamp);

  // stage 1 — who ever checkpointed on the old contract?
  console.log("\nstage 1: old lastSnapshot != 0");
  const s1 = await aggregate(mc, pairs.map((p) => {
    const [u, t] = p.split("|");
    return { target: OLD, allowFailure: true, callData: rewIface.encodeFunctionData("lastSnapshot", [u, t]) };
  }));
  const stage2 = pairs.filter((_, i) => s1[i] && BigInt(s1[i]!) !== 0n);
  console.log(`  ${stage2.length} of ${pairs.length} ever checkpointed`);

  // stage 2 — how much can they still claim there?
  console.log("\nstage 2: old claimableOf > 0");
  const s2 = await aggregate(mc, stage2.map((p) => {
    const [u, t] = p.split("|");
    return { target: OLD, allowFailure: true, callData: rewIface.encodeFunctionData("claimableOf", [u, t]) };
  }));
  const owed = stage2.map((p, i) => ({ p, lost: s2[i] ? BigInt(s2[i]!) : 0n })).filter((x) => x.lost > 0n);
  const totalLost = owed.reduce((s, x) => s + x.lost, 0n);
  console.log(`  ${owed.length} entries owed, total ${ethers.formatUnits(totalLost, 6)} USYC`);

  // stage 3 — current position + whether the new contract is still bootstrappable
  console.log("\nstage 3: hub shares + new lastSnapshot");
  const s3a = await aggregate(mc, owed.map(({ p }) => {
    const [u, t] = p.split("|");
    return { target: HUB, allowFailure: true, callData: hubIface.encodeFunctionData("shares", [t, u]) };
  }));
  const s3b = await aggregate(mc, owed.map(({ p }) => {
    const [u, t] = p.split("|");
    return { target: NEW, allowFailure: true, callData: rewIface.encodeFunctionData("lastSnapshot", [u, t]) };
  }));

  const tokens = [...new Set(owed.map((x) => x.p.split("|")[1]))];
  const rateRes = await aggregate(mc, tokens.map((t) => ({ target: NEW, allowFailure: true, callData: rewIface.encodeFunctionData("rewardRate", [t]) })));
  const rate = new Map(tokens.map((t, i) => [t, rateRes[i] ? BigInt(rateRes[i]!) : 0n]));

  const backdate: any[] = [], transfer: any[] = [], blocked: any[] = [];
  owed.forEach(({ p, lost }, i) => {
    const [user, token] = p.split("|");
    const shares = s3a[i] ? BigInt(s3a[i]!) : 0n;
    const already = s3b[i] ? BigInt(s3b[i]!) : 0n;
    if (already !== 0n) { blocked.push({ user, token, lost: lost.toString() }); return; }
    const tvl = (shares * 2n) / 10n ** 12n;
    const r = rate.get(token) ?? 0n;
    if (tvl === 0n || r === 0n) { transfer.push({ user, token, lost: lost.toString(), reason: "no current position" }); return; }
    const elapsed = (lost * 10000n * YEAR) / (tvl * r);
    if (elapsed === 0n) { transfer.push({ user, token, lost: lost.toString(), reason: "amount too small to backdate" }); return; }
    backdate.push({ user, token, lost: lost.toString(), credited: ((tvl * r * elapsed) / (10000n * YEAR)).toString(), backdate: (now - elapsed).toString() });
  });

  const sum = (a: any[], k: string) => a.reduce((s, r) => s + BigInt(r[k]), 0n);
  const gas = GAS_PER_ENTRY * BigInt(backdate.length);
  const feeData = await ethers.provider.getFeeData();
  const cost = gas * (feeData.gasPrice ?? 0n);

  console.log("\n=== FAITHFUL RESTORE PLAN (dry run — nothing sent) ===");
  console.log(`  total owed            : ${ethers.formatUnits(totalLost, 6)} USYC`);
  console.log(`  via ownerSnapshotBatch: ${backdate.length} entries, ${ethers.formatUnits(sum(backdate, "credited"), 6)} USYC`);
  console.log(`  via direct transfer   : ${transfer.length} entries, ${ethers.formatUnits(sum(transfer, "lost"), 6)} USYC`);
  console.log(`  blocked (already snapshotted on new): ${blocked.length} entries, ${ethers.formatUnits(sum(blocked, "lost"), 6)} USYC`);
  console.log(`\n  est. payout gas: ${gas} @ ${ethers.formatUnits(feeData.gasPrice ?? 0n, 9)} gwei = ${ethers.formatUnits(cost, 18)} USDC`);
  console.log(`  deployer gas balance: ${ethers.formatUnits(await ethers.provider.getBalance((await ethers.getSigners())[0].address), 18)} USDC`);

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), now: now.toString(), backdate, transfer, blocked }, null, 2));
  console.log(`\nplan written to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
