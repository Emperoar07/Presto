import hre from "hardhat";

const USYC = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const USDC = "0x3600000000000000000000000000000000000000";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const AMM_ABI = [
  "function tokenReserves(address) view returns (uint256)",
  "function pathReserves(address) view returns (uint256)",
  "function getQuote(address,address,uint256) view returns (uint256)",
  "function pathUSD() view returns (address)",
];

async function main() {
  const { ethers } = hre;
  const provider = ethers.provider;
  const usyc = await ethers.getContractAt(ERC20_ABI, USYC);

  const totalSupply = await usyc.totalSupply();
  const dec = await usyc.decimals();
  console.log("Official USYC total supply:", ethers.formatUnits(totalSupply, dec));

  // Scan Transfer events to find top holders
  console.log("\nScanning Transfer events for official USYC...");
  const latestBlock = await provider.getBlockNumber();
  const startBlock = Math.max(0, latestBlock - 200000);
  const CHUNK = 9999;

  const filter = usyc.filters.Transfer();
  const events: any[] = [];
  for (let from = startBlock; from <= latestBlock; from += CHUNK + 1) {
    const to = Math.min(from + CHUNK, latestBlock);
    const chunk = await usyc.queryFilter(filter, from, to);
    events.push(...chunk);
  }
  console.log(`Found ${events.length} Transfer events (last 200k blocks)`);

  // Track balances from events
  const balances: Record<string, bigint> = {};
  for (const e of events) {
    const args = (e as any).args;
    const from = args[0];
    const to = args[1];
    const value = args[2];
    if (from !== ethers.ZeroAddress) {
      balances[from] = (balances[from] ?? 0n) - value;
    }
    balances[to] = (balances[to] ?? 0n) + value;
  }

  // Sort by balance descending and check top holders
  const sorted = Object.entries(balances)
    .map(([addr, bal]) => ({ addr, bal }))
    .filter(x => x.bal > 0n)
    .sort((a, b) => (b.bal > a.bal ? 1 : -1));

  console.log("\nTop USYC holders (from events):");
  for (const { addr, bal } of sorted.slice(0, 15)) {
    // Verify on-chain balance
    const actualBal = await usyc.balanceOf(addr);
    const code = await provider.getCode(addr);
    const isContract = code !== "0x";
    console.log(`  ${addr}: ${ethers.formatUnits(actualBal, dec)} USYC ${isContract ? "(CONTRACT)" : "(EOA)"}`);

    // If it's a contract, check if it's an AMM with USYC reserves
    if (isContract && actualBal > 0n) {
      try {
        const amm = await ethers.getContractAt(AMM_ABI, addr);
        const tR = await amm.tokenReserves(USYC);
        const pR = await amm.pathReserves(USYC);
        const hub = await amm.pathUSD();
        console.log(`    ^ AMM! hub=${hub} tokenReserves=${ethers.formatUnits(tR, dec)} pathReserves=${ethers.formatUnits(pR, 6)}`);

        // Try a quote: 10 USDC -> USYC
        const quote = await amm.getQuote(USDC, USYC, ethers.parseUnits("10", 6));
        console.log(`    ^ Quote: 10 USDC -> ${ethers.formatUnits(quote, dec)} USYC`);
      } catch {
        console.log(`    ^ Not an AMM (no tokenReserves/pathReserves)`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
