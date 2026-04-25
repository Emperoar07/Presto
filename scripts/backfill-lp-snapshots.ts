import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

const HUB_AMM_ADDRESS = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const REWARDS_ADDRESS = process.env.NEW_REWARDS_ADDRESS ?? "";

const LIQUIDITY_ADDED_TOPIC = ethers.id(
  "LiquidityAdded(address,address,uint256,uint256,uint256)"
);

const FROM_BLOCK = 38500000; // ~5 days ago (rewards start date)
const CHUNK = 5000;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

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
  if (!ethers.isAddress(REWARDS_ADDRESS)) {
    throw new Error("Set NEW_REWARDS_ADDRESS env var to the new contract address");
  }

  const provider = ethers.provider;
  const rewards = await ethers.getContractAt("USYCRewards", REWARDS_ADDRESS);

  console.log("Scanning LiquidityAdded events from HubAMM...");

  const latestBlock = await withRetry("getBlockNumber", () => provider.getBlockNumber());
  console.log(`Latest block: ${latestBlock}`);

  const earliest: Map<string, { user: string; token: string; timestamp: number; blockNumber: number }> = new Map();

  for (let from = FROM_BLOCK; from <= latestBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latestBlock);

    const logs = await withRetry(`getLogs ${from}-${to}`, () =>
      provider.getLogs({
        address: HUB_AMM_ADDRESS,
        topics: [LIQUIDITY_ADDED_TOPIC],
        fromBlock: from,
        toBlock: to,
      })
    );

    for (const log of logs) {
      const providerAddr = "0x" + log.topics[1].slice(26);
      const token = "0x" + log.topics[2].slice(26);
      const key = `${providerAddr.toLowerCase()}-${token.toLowerCase()}`;
      const existing = earliest.get(key);
      if (!existing || log.blockNumber < existing.blockNumber) {
        earliest.set(key, {
          user: providerAddr,
          token,
          timestamp: 0,
          blockNumber: log.blockNumber,
        });
      }
    }

    if (logs.length > 0) {
      process.stdout.write(`  scanned to block ${to}, ${earliest.size} unique positions\n`);
    }
  }

  if (earliest.size === 0) {
    console.log("No LiquidityAdded events found.");
    return;
  }

  console.log(`\nResolving timestamps for ${earliest.size} positions...`);
  const blockTsCache = new Map<number, number>();
  for (const entry of earliest.values()) {
    if (!blockTsCache.has(entry.blockNumber)) {
      const block = await withRetry(`getBlock ${entry.blockNumber}`, () =>
        provider.getBlock(entry.blockNumber)
      );
      if (!block) continue;
      blockTsCache.set(entry.blockNumber, block.timestamp);
    }
    entry.timestamp = blockTsCache.get(entry.blockNumber) ?? 0;
  }

  const entries = Array.from(earliest.values()).filter((e) => e.timestamp > 0);
  console.log(`\nFound ${entries.length} positions with valid timestamps.`);

  const output = entries.map(e => ({ user: e.user, token: e.token, timestamp: e.timestamp }));
  if (!fs.existsSync("data")) fs.mkdirSync("data");
  fs.writeFileSync("data/backfill-positions.json", JSON.stringify(output, null, 2));
  console.log(`Saved to data/backfill-positions.json — now run set-snapshots.ts to write on-chain.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
