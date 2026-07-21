import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

/**
 * DRY RUN — sends no transactions.
 *
 * Builds the "faithful" restore plan: for every Hub LP, read what they can still
 * claim on the OLD (swept) USYCRewards, then compute the backdated ownerSnapshot
 * timestamp on the NEW contract that re-accrues exactly that much.
 *
 *   accrued = (shares*2/1e12) * rate * elapsed / (1e4 * YEAR)
 *   =>  elapsed = lost * 1e4 * YEAR / (tvl * rate)
 */

const HUB = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const OLD_USYC_REWARDS = "0x3454fB11Ead7a10806434daE0A7EfFd289ABb908";
const NEW_USYC_REWARDS = "0xc4F909a6BACF1485fa67cB9d69CDe0Bd3Ce1FA44";
const HUB_FROM_BLOCK = 32_654_062; // verified via binary search
const CHUNK = 10_000;              // Arc RPC hard limit for eth_getLogs
const YEAR = 365n * 24n * 60n * 60n;

const CACHE = "data/lp-providers.json";
const OUT = "data/faithful-restore-plan.json";

const TOPIC = ethers.id("LiquidityAdded(address,address,uint256,uint256,uint256)");
const REW_ABI = [
  "function claimableOf(address user, address token) view returns (uint256)",
  "function lastSnapshot(address,address) view returns (uint256)",
  "function rewardRate(address token) view returns (uint256)",
  "function poolEnabled(address) view returns (bool)",
];
const HUB_ABI = ["function shares(address,address) view returns (uint256)"];

async function collectPairs(latest: number): Promise<string[]> {
  if (fs.existsSync(CACHE)) {
    const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (c.toBlock >= latest - CHUNK) {
      console.log(`reusing cached pairs (${c.pairs.length}) scanned to block ${c.toBlock}`);
      return c.pairs;
    }
  }
  const pairs = new Set<string>();
  const total = Math.ceil((latest - HUB_FROM_BLOCK) / CHUNK);
  let done = 0;
  for (let from = HUB_FROM_BLOCK; from <= latest; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latest);
    try {
      const logs = await ethers.provider.getLogs({ address: HUB, topics: [TOPIC], fromBlock: from, toBlock: to });
      for (const l of logs) {
        const provider = ethers.getAddress("0x" + l.topics[1].slice(26)).toLowerCase();
        const token = ethers.getAddress("0x" + l.topics[2].slice(26)).toLowerCase();
        pairs.add(`${provider}|${token}`);
      }
    } catch (e: any) {
      console.log(`  chunk ${from}-${to} failed: ${String(e?.message ?? e).slice(0, 60)}`);
    }
    if (++done % 100 === 0) console.log(`  scanned ${done}/${total} chunks — ${pairs.size} pairs so far`);
  }
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ toBlock: latest, pairs: [...pairs] }, null, 2));
  return [...pairs];
}

async function main() {
  const latest = await ethers.provider.getBlockNumber();
  const now = BigInt((await ethers.provider.getBlock(latest))!.timestamp);
  console.log(`latest block ${latest} | now ${now}`);
  console.log(`scanning Hub LiquidityAdded from ${HUB_FROM_BLOCK} (${Math.ceil((latest - HUB_FROM_BLOCK) / CHUNK)} chunks)...`);

  const pairs = await collectPairs(latest);
  console.log(`\n${pairs.length} unique (provider, token) pairs\n`);

  const hub = await ethers.getContractAt(HUB_ABI, HUB);
  const oldR = await ethers.getContractAt(REW_ABI, OLD_USYC_REWARDS);
  const newR = await ethers.getContractAt(REW_ABI, NEW_USYC_REWARDS);

  const rate = new Map<string, bigint>();
  const enabled = new Map<string, boolean>();
  const plan: any[] = [];
  let totalLost = 0n, nothing = 0, alreadySet = 0;

  for (const p of pairs) {
    const [user, token] = p.split("|");
    if (!enabled.has(token)) {
      enabled.set(token, await newR.poolEnabled(token));
      rate.set(token, (await newR.rewardRate(token)) as bigint);
    }
    if (!enabled.get(token)) continue;

    const [lost, shares, already] = await Promise.all([
      oldR.claimableOf(user, token) as Promise<bigint>,
      hub.shares(token, user) as Promise<bigint>,
      newR.lastSnapshot(user, token) as Promise<bigint>,
    ]);
    if (lost === 0n) { nothing++; continue; }
    totalLost += lost;
    if (already !== 0n) { alreadySet++; continue; }

    const tvl = (shares * 2n) / 10n ** 12n;
    const r = rate.get(token)!;
    if (tvl === 0n || r === 0n) {
      plan.push({ user, token, lost: lost.toString(), mode: "TRANSFER", reason: "no current position" });
      continue;
    }
    const elapsed = (lost * 10000n * YEAR) / (tvl * r);
    if (elapsed === 0n) { nothing++; continue; }
    const credited = (tvl * r * elapsed) / (10000n * YEAR);
    plan.push({
      user, token, mode: "BACKDATE",
      lost: lost.toString(), credited: credited.toString(),
      elapsed: elapsed.toString(), backdate: (now - elapsed).toString(),
    });
  }

  const back = plan.filter((r) => r.mode === "BACKDATE");
  const xfer = plan.filter((r) => r.mode === "TRANSFER");
  const sum = (a: any[], k: string) => a.reduce((s, r) => s + BigInt(r[k]), 0n);

  console.log("=== FAITHFUL RESTORE PLAN (dry run — nothing sent) ===");
  for (const r of plan) {
    if (r.mode === "BACKDATE")
      console.log(`  ${r.user} ${r.token}\n     lost=${ethers.formatUnits(r.lost, 6)} credit=${ethers.formatUnits(r.credited, 6)} USYC backdate=${r.backdate} (-${r.elapsed}s)`);
    else
      console.log(`  ${r.user} ${r.token}\n     lost=${ethers.formatUnits(r.lost, 6)} USYC -> DIRECT TRANSFER (${r.reason})`);
  }
  console.log(`\nsummary:`);
  console.log(`  total lost              : ${ethers.formatUnits(totalLost, 6)} USYC`);
  console.log(`  restorable via backdate : ${back.length} entries, ${ethers.formatUnits(sum(back, "credited"), 6)} USYC`);
  console.log(`  needs direct transfer   : ${xfer.length} entries, ${ethers.formatUnits(sum(xfer, "lost"), 6)} USYC`);
  console.log(`  skipped (nothing lost)  : ${nothing}`);
  console.log(`  skipped (already snapshotted on new): ${alreadySet}`);

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), now: now.toString(), plan }, null, 2));
  console.log(`\nplan written to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
