import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

// Hardcoded from the scan — 69 positions found over last 5 days
const REWARDS_ADDRESS = "0x3454fB11Ead7a10806434daE0A7EfFd289ABb908";

const POSITIONS = [
  // Written inline from scan output — grouped by unique user/token/timestamp
  // These are loaded from the scan output file if it exists, otherwise use inline
];

const SCAN_OUTPUT = "data/backfill-positions.json";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 4000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e as Error)?.message ?? String(e);
      console.warn(`  ${label} attempt ${attempt} failed: ${msg.slice(0, 120)}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

async function main() {
  if (!fs.existsSync(SCAN_OUTPUT)) {
    throw new Error(`Run scan first: ${SCAN_OUTPUT} not found`);
  }

  const entries: { user: string; token: string; timestamp: number }[] = JSON.parse(
    fs.readFileSync(SCAN_OUTPUT, "utf-8")
  );

  console.log(`Loaded ${entries.length} positions from ${SCAN_OUTPUT}`);

  const rewards = await ethers.getContractAt("USYCRewards", REWARDS_ADDRESS);

  const toSet: typeof entries = [];
  for (const e of entries) {
    const existing = await withRetry("lastSnapshot", () => rewards.lastSnapshot(e.user, e.token));
    if (existing === 0n) toSet.push(e);
  }

  console.log(`${toSet.length} positions need snapshots (${entries.length - toSet.length} already set).`);
  if (toSet.length === 0) { console.log("All done."); return; }

  const BATCH = 50;
  for (let i = 0; i < toSet.length; i += BATCH) {
    const chunk = toSet.slice(i, i + BATCH);
    await withRetry(`ownerSnapshotBatch ${i}`, async () => {
      const tx = await rewards.ownerSnapshotBatch(
        chunk.map(e => e.user),
        chunk.map(e => e.token),
        chunk.map(e => BigInt(e.timestamp)),
      );
      await tx.wait();
    });
    console.log(`  Set ${i + chunk.length}/${toSet.length}`);
  }

  console.log("\nDone. All past LPs can now claim retroactive rewards.");
}

main().catch((e) => { console.error(e); process.exit(1); });
