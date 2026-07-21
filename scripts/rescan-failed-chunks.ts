import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

/**
 * Re-scans block ranges that failed during the main Hub LiquidityAdded sweep and
 * merges any newly-found providers into data/lp-providers.json.
 *
 * The main scan logs-and-continues on RPC hiccups (Headers Timeout etc). For a
 * make-whole payout a silently-missed range means a silently-missed user, so
 * every failed range must be retried until it genuinely succeeds.
 *
 * Input : data/failed-chunks.json  -> [{ "from": 33484062, "to": 33494061 }, ...]
 * Output: merged data/lp-providers.json
 */

const HUB = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const TOPIC = ethers.id("LiquidityAdded(address,address,uint256,uint256,uint256)");
const FAILED = "data/failed-chunks.json";
const CACHE = "data/lp-providers.json";
const MAX_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scanWithRetry(from: number, to: number): Promise<string[] | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const logs = await ethers.provider.getLogs({ address: HUB, topics: [TOPIC], fromBlock: from, toBlock: to });
      return logs.map((l) => {
        const provider = ethers.getAddress("0x" + l.topics[1].slice(26)).toLowerCase();
        const token = ethers.getAddress("0x" + l.topics[2].slice(26)).toLowerCase();
        return `${provider}|${token}`;
      });
    } catch (e: any) {
      const wait = 1000 * 2 ** (attempt - 1);
      console.log(`  ${from}-${to} attempt ${attempt}/${MAX_ATTEMPTS} failed (${String(e?.message ?? e).slice(0, 50)}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(FAILED)) {
    console.log(`no ${FAILED} — nothing to retry`);
    return;
  }
  const ranges: { from: number; to: number }[] = JSON.parse(fs.readFileSync(FAILED, "utf8"));
  console.log(`retrying ${ranges.length} failed range(s)...`);

  const existing: string[] = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")).pairs ?? [] : [];
  const pairs = new Set(existing);
  const before = pairs.size;
  const stillFailing: { from: number; to: number }[] = [];

  for (const { from, to } of ranges) {
    // Split into 10k sub-ranges (Arc's eth_getLogs hard limit).
    for (let s = from; s <= to; s += 10_000) {
      const e = Math.min(s + 9_999, to);
      const found = await scanWithRetry(s, e);
      if (found === null) { stillFailing.push({ from: s, to: e }); continue; }
      found.forEach((p) => pairs.add(p));
      console.log(`  ${s}-${e}: OK (${found.length} events)`);
    }
  }

  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  fs.writeFileSync(CACHE, JSON.stringify({ ...cache, pairs: [...pairs] }, null, 2));
  console.log(`\nrecovered ${pairs.size - before} new pair(s); total ${pairs.size}`);

  if (stillFailing.length) {
    fs.writeFileSync(FAILED, JSON.stringify(stillFailing, null, 2));
    console.error(`\n!! ${stillFailing.length} range(s) STILL failing — do NOT run the payout yet:`);
    stillFailing.forEach((r) => console.error(`   ${r.from}-${r.to}`));
    process.exitCode = 1;
  } else {
    fs.writeFileSync(FAILED, "[]");
    console.log("all previously-failed ranges recovered — enumeration is complete.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
