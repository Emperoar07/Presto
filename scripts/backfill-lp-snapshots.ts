import hre from "hardhat";
const { ethers } = hre;

const HUB_AMM_ADDRESS = "0x5794a8284A29493871Fbfa3c4f343D42001424D6";
const REWARDS_ADDRESS = "0x73EE8fc7F98f18F2bE97227F913F387Ca8eC65b7";

const LIQUIDITY_ADDED_TOPIC = ethers.id(
  "LiquidityAdded(address,address,uint256,uint256,uint256)"
);

async function main() {
  const provider = ethers.provider;
  const [deployer] = await ethers.getSigners();

  const rewards = await ethers.getContractAt("USYCRewards", REWARDS_ADDRESS);

  console.log("Scanning LiquidityAdded events from HubAMM...");

  const latestBlock = await provider.getBlockNumber();
  const CHUNK = 2000;

  // user+token => earliest block timestamp
  const earliest: Map<string, { user: string; token: string; timestamp: number }> = new Map();

  for (let from = 0; from <= latestBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latestBlock);
    const logs = await provider.getLogs({
      address: HUB_AMM_ADDRESS,
      topics: [LIQUIDITY_ADDED_TOPIC],
      fromBlock: from,
      toBlock: to,
    });

    for (const log of logs) {
      const provider_addr = "0x" + log.topics[1].slice(26);
      const token = "0x" + log.topics[2].slice(26);
      const key = `${provider_addr.toLowerCase()}-${token.toLowerCase()}`;

      const block = await ethers.provider.getBlock(log.blockNumber);
      if (!block) continue;
      const ts = block.timestamp;

      const existing = earliest.get(key);
      if (!existing || ts < existing.timestamp) {
        earliest.set(key, { user: provider_addr, token, timestamp: ts });
      }
    }

    if (logs.length > 0) process.stdout.write(`  scanned to block ${to}, found ${earliest.size} unique positions so far\n`);
  }

  if (earliest.size === 0) {
    console.log("No LiquidityAdded events found.");
    return;
  }

  const entries = Array.from(earliest.values());
  console.log(`\nFound ${entries.length} unique user/token positions. Backfilling snapshots...`);

  // Filter out entries where snapshot is already set
  const toSet: typeof entries = [];
  for (const e of entries) {
    const existing = await rewards.lastSnapshot(e.user, e.token);
    if (existing === 0n) toSet.push(e);
  }

  console.log(`${toSet.length} positions need snapshots (${entries.length - toSet.length} already set).`);

  if (toSet.length === 0) {
    console.log("All snapshots already set.");
    return;
  }

  // Batch in chunks of 50 to avoid gas limits
  const BATCH = 50;
  for (let i = 0; i < toSet.length; i += BATCH) {
    const chunk = toSet.slice(i, i + BATCH);
    const users = chunk.map(e => e.user);
    const tokens = chunk.map(e => e.token);
    const timestamps = chunk.map(e => BigInt(e.timestamp));

    const tx = await rewards.ownerSnapshotBatch(users, tokens, timestamps);
    await tx.wait();
    console.log(`  Set snapshots for ${i + chunk.length}/${toSet.length}`);
  }

  console.log("\nDone. All past LPs can now claim retroactive rewards.");
  console.log("Sample positions:");
  toSet.slice(0, 5).forEach(e =>
    console.log(`  ${e.user} / ${e.token} — first deposit: ${new Date(e.timestamp * 1000).toISOString()}`)
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
