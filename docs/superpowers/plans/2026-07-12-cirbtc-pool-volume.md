# cirBTC Pool Volume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded cirBTC pool volume with the exact rolling 24 hour USDC volume from its Arc Uniswap V2 pair and expose it consistently on Pools and Analytics.

**Architecture:** Add a focused server utility that finds a block by timestamp, scans canonical pair `Swap` logs in Arc sized chunks, and aggregates the USDC side. Merge its result and pair reserves into the existing `/api/pool-stats` record for cirBTC; both screens then consume that one record. The all time cards remain unchanged because rolling volume must not be presented as all time volume.

**Tech Stack:** Next.js route handlers, TypeScript, viem, React Query, Node test runner.

---

### Task 1: Pure Uniswap V2 volume accounting

**Files:**
- Create: `src/lib/uniswapV2Volume.ts`
- Create: `test/uniswap-v2-volume.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing accounting tests**

Create tests with synthetic canonical `Swap` arguments that assert `sumUsdcVolume` selects `amount0In || amount0Out` when USDC is token zero, selects token one amounts when USDC is token one, counts each log once, and returns `{ volumeRaw: 0n, swapCount: 0 }` for an empty list.

```ts
test('sums the USDC side when USDC is token0', () => {
  const result = sumUsdcVolume([
    swap({ amount0In: 20_000_000n, amount1Out: 25_000n }),
    swap({ amount1In: 10_000n, amount0Out: 31_000_000n }),
  ], USDC, USDC, CIRBTC);
  assert.deepEqual(result, { volumeRaw: 51_000_000n, swapCount: 2 });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test test/uniswap-v2-volume.test.ts`

Expected: FAIL because `src/lib/uniswapV2Volume.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Export typed `UniswapV2SwapArgs`, `sumUsdcVolume(logs, usdc, token0, token1)`, and `formatUsdcVolume(raw)`. Reject a pair that does not contain USDC, prefer the nonzero input amount and otherwise use output, and preserve six decimal raw precision.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx tsx --test test/uniswap-v2-volume.test.ts`

Expected: all accounting and formatting tests pass.

- [ ] **Step 5: Add the test to `test:api` and commit**

Set `test:api` to `tsx --test test/synroute-utils.test.ts test/uniswap-v2-volume.test.ts`.

```bash
git add src/lib/uniswapV2Volume.ts test/uniswap-v2-volume.test.ts package.json
git commit -m "test: cover Uniswap V2 pool volume accounting"
```

### Task 2: Arc rolling window scanner

**Files:**
- Modify: `src/lib/uniswapV2Volume.ts`
- Modify: `test/uniswap-v2-volume.test.ts`

- [ ] **Step 1: Write failing boundary and chunk tests**

Use a fake client with deterministic block timestamps and recorded `getLogs` calls. Assert `findFirstBlockAtOrAfter` returns the first block meeting the cutoff and `scanUniswapV2Volume` covers the complete inclusive range with 1,000 block chunks and the canonical `Swap` event filter.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx tsx --test test/uniswap-v2-volume.test.ts`

Expected: FAIL because the scanner exports are missing.

- [ ] **Step 3: Implement the scanner**

Add `findFirstBlockAtOrAfter(client, lowBlock, highBlock, cutoffTimestamp)` using binary search. Add `scanUniswapV2Volume(client, pair, usdc, token0, token1, latestBlock, cutoffTimestamp)` using 1,000 block inclusive chunks, `parseAbiItem('event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)')`, and the pure aggregator.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx tsx --test test/uniswap-v2-volume.test.ts`

Expected: all scanner tests pass and every expected block is queried once.

- [ ] **Step 5: Commit**

```bash
git add src/lib/uniswapV2Volume.ts test/uniswap-v2-volume.test.ts
git commit -m "feat: scan rolling Uniswap V2 volume on Arc"
```

### Task 3: Merge fork liquidity and volume into pool stats

**Files:**
- Modify: `app/api/pool-stats/route.ts`
- Create: `test/pool-stats-fork.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing merge test**

Extract and test `mergeForkPoolStat`. Given a cirBTC base record, pair reserves, token ordering, and `$63.346118` volume, assert liquidity uses the USDC reserve on both sides for TVL, `vol24hRaw` is `63346118`, `swapCount` is `2`, and unrelated Hub records are byte for byte unchanged.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test test/pool-stats-fork.test.ts`

Expected: FAIL because the merge helper is missing.

- [ ] **Step 3: Implement server integration**

Resolve the pair from the configured factory, read `token0`, `getReserves`, and the latest block, calculate the cutoff as the latest block timestamp minus 86,400 seconds, and call `scanUniswapV2Volume`. Override only the cirBTC record with fork TVL, rolling volume, count, and active state. Keep the existing 60 second route cache and RPC failover; if fork scanning fails, retain a previous fork value when available and otherwise return an unavailable display state rather than claiming a measured zero.

- [ ] **Step 4: Run API tests and confirm GREEN**

Run: `npm run test:api`

Expected: SynRoute, volume accounting, scanner, and pool merge tests all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/pool-stats/route.ts test/pool-stats-fork.test.ts package.json
git commit -m "feat: expose cirBTC fork volume in pool stats"
```

### Task 4: Wire Pools and Analytics to the shared value

**Files:**
- Modify: `src/components/liquidity/UniswapForkPools.tsx`
- Verify: `app/analytics/page.tsx`

- [ ] **Step 1: Add a failing presentation helper test**

Add a pure selector test asserting that a pool stats response containing the cirBTC address returns its `vol24h`, raw volume, and availability state independent of pool ordering.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test test/uniswap-v2-volume.test.ts`

Expected: FAIL because the selector is missing.

- [ ] **Step 3: Replace hardcoded values**

Use `usePoolStats()` in `UniswapForkPools`, select by token address, and replace every `$0 24h volume`, `$0`, and em dash volume placeholder with the shared formatted value or `--` when unavailable. No Analytics component change is needed: its chart and Pool Activity table already render `poolStats.pools[].vol24h`, so verify cirBTC receives the merged API record.

- [ ] **Step 4: Run complete verification**

Run: `npm run test:api`

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits 0. Compare `/api/pool-stats` against a direct Arc scan of pair `0x789CA3EfC403Df1Fe58867D50EBA5C3fa0E652C8`; the rolling value and swap count must match, and both Pools and Analytics must display that response.

- [ ] **Step 5: Commit**

```bash
git add src/components/liquidity/UniswapForkPools.tsx test/uniswap-v2-volume.test.ts
git commit -m "fix: display cirBTC volume across pools and analytics"
```
