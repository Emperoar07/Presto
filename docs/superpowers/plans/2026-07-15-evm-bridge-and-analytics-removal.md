# EVM Bridge Refresh And Analytics Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Solana Devnet with Avalanche Fuji, Arbitrum Sepolia, and Optimism Sepolia in the Circle CCTP bridge, remove all Solana code and dependencies, and remove the Analytics product surface.

**Architecture:** Keep the bridge registry in `src/components/bridge/constants.ts` as the source of truth for six EVM testnets. Use one Viem browser wallet adapter for every source and destination, with chain switching driven by registry metadata. Delete ecosystem branches and Analytics modules that no active route consumes.

**Tech Stack:** Next.js 16, React 18, TypeScript, Wagmi, Viem, Circle Bridge Kit, Circle Viem adapter, Node test runner.

---

### Task 1: Lock The EVM Bridge Registry With Tests

**Files:**
- Create: `test/bridge-config.test.ts`
- Modify: `package.json`
- Modify: `src/components/bridge/types.ts`
- Modify: `src/components/bridge/constants.ts`

- [ ] **Step 1: Write the failing registry tests**

Create tests asserting that `BRIDGE_NETWORKS` is exactly `arc`, `ethereum-sepolia`, `base-sepolia`, `avalanche-fuji`, `arbitrum-sepolia`, and `optimism-sepolia`. Assert Circle chain names, chain IDs, CCTP domains, official USDC addresses, EVM transaction hash validation, and explorers for Fuji, Arbitrum, and Optimism.

```ts
assert.deepEqual(BRIDGE_NETWORKS, [
  'arc',
  'ethereum-sepolia',
  'base-sepolia',
  'avalanche-fuji',
  'arbitrum-sepolia',
]);
assert.equal(NETWORKS['avalanche-fuji'].bridgeChain, 'Avalanche_Fuji');
assert.equal(NETWORKS['arbitrum-sepolia'].bridgeChain, 'Arbitrum_Sepolia');
assert.equal(BRIDGE_USDC_ADDRESSES['avalanche-fuji'], '0x5425890298aed601595a70AB815c96711a31Bc65');
assert.equal(BRIDGE_USDC_ADDRESSES['arbitrum-sepolia'], '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test test/bridge-config.test.ts`

Expected: failure because the new keys are missing and Solana remains.

- [ ] **Step 3: Implement the six network registry**

Change `BridgeNetworkKey` and `NetworkConfig` to EVM only. Import Viem definitions for `avalancheFuji` and `arbitrumSepolia`. Add the two network entries, USDC addresses, CCTP domains, wallet add metadata, public clients, explorer mappings, and validation.

```ts
export type BridgeNetworkKey =
  | 'arc'
  | 'ethereum-sepolia'
  | 'base-sepolia'
  | 'avalanche-fuji'
  | 'arbitrum-sepolia';

export type NetworkConfig = {
  key: BridgeNetworkKey;
  bridgeChain: 'Arc_Testnet' | 'Ethereum_Sepolia' | 'Base_Sepolia' | 'Avalanche_Fuji' | 'Arbitrum_Sepolia' | 'Optimism_Sepolia';
  ecosystem: 'evm';
  chainId: number;
  label: string;
  shortLabel: string;
  helper: string;
};
```

- [ ] **Step 4: Add the bridge test to `test:api` and verify GREEN**

Run: `npm run test:api`

Expected: all API and bridge registry tests pass.

### Task 2: Remove The Solana Runtime

**Files:**
- Delete: `src/components/bridge/BridgeSolanaProvider.tsx`
- Modify: `app/bridge/page.tsx`
- Modify: `src/components/bridge/BridgeWorkspace.tsx`
- Modify: `src/components/bridge/useBridgeBalance.ts`
- Modify: `src/components/bridge/useBridgeHistory.ts`
- Modify: `src/components/bridge/BridgeHistoryPanel.tsx`
- Modify: `src/components/bridge/BridgeEstimatePanel.tsx`
- Modify: `app/transactions/page.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing history validation test**

Add a test proving an old `solana-devnet` record is rejected while Fuji and Arbitrum EVM records with 32 byte transaction hashes are accepted.

```ts
assert.equal(isValidBridgeHistoryItem({ ...historyItem, sourceKey: 'solana-devnet' }), false);
assert.equal(isValidBridgeHistoryItem({ ...historyItem, sourceKey: 'avalanche-fuji' }), true);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test test/bridge-config.test.ts`

Expected: failure because Solana history is still valid and Fuji is unknown.

- [ ] **Step 3: Simplify the bridge workspace to one EVM wallet model**

Remove Solana imports, provider state, adapters, address branches, connection actions, picker modal, source restrictions, serialization helpers, and ecosystem specific labels. Make source and destination resolve to EVM addresses and keep custom EVM recipients.

```ts
const sourceAddress = evmAddress ?? '';
const resolvedDestinationAddress = useMemo(
  () => useManualDestination && manualDestination.trim()
    ? manualDestination.trim()
    : evmAddress ?? '',
  [evmAddress, manualDestination, useManualDestination],
);
```

Use `createViemAdapterFromProvider` for every configured network. Keep source chain switching before estimation and submission.

- [ ] **Step 4: Remove Solana balance, receipt, and explorer branches**

Use ERC20 `balanceOf` and EVM receipts for all six networks. Remove Solana query methods and query suffixes from history panels and the transaction page.

- [ ] **Step 5: Remove Solana packages**

Run:

```text
npm uninstall @circle-fin/adapter-solana-kit @solana/wallet-adapter-base @solana/wallet-adapter-phantom @solana/wallet-adapter-react @solana/wallet-adapter-solflare
```

Expected: `package.json` and lockfile no longer contain direct Solana bridge dependencies.

- [ ] **Step 6: Verify the focused tests and type checker**

Run: `npm run test:api`

Run: `npx tsc --noEmit`

Expected: both commands exit successfully.

### Task 3: Remove Analytics Completely

**Files:**
- Delete: `app/analytics/page.tsx`
- Delete: `app/analytics/layout.tsx`
- Delete: `app/api/analytics/aggregate/route.ts`
- Delete: `src/components/analytics/AnalyticsDashboard.tsx`
- Delete: `data/analytics.json`
- Modify: `src/components/common/AppSidebar.tsx`
- Modify: `src/components/common/PageTopbar.tsx`
- Modify: `app/page.tsx`
- Modify: `src/hooks/useApiQueries.ts`
- Modify: `scripts/indexer.mjs`
- Modify: `data/indexer-state.json`

- [ ] **Step 1: Add a failing product surface audit test**

Assert the active navigation and top bar source no longer contain `/analytics`, and the route and API files do not exist after implementation. Before deletion, run it to prove RED.

```ts
assert.equal(sidebarSource.includes("href: '/analytics'"), false);
assert.equal(existsSync('app/analytics/page.tsx'), false);
assert.equal(existsSync('app/api/analytics/aggregate/route.ts'), false);
```

- [ ] **Step 2: Run the audit and verify RED**

Run: `npx tsx --test test/product-surface.test.ts`

Expected: failure because Analytics files and navigation still exist.

- [ ] **Step 3: Delete Analytics routes and navigation**

Remove the route, layout, API, dashboard, sidebar entry, top bar title, and homepage feature. Update shared hook comments so they describe their remaining consumers.

- [ ] **Step 4: Stop producing unused analytics files**

Remove `ANALYTICS_OUTPUT`, analytics state aggregation, and analytics file writes from `scripts/indexer.mjs` while preserving order metadata and transaction indexing. Remove the analytics property from generated state only when no active code reads it.

- [ ] **Step 5: Run the product audit and verify GREEN**

Run: `npx tsx --test test/product-surface.test.ts`

Expected: all product surface assertions pass.

### Task 4: Update Product Documentation And Copy

**Files:**
- Modify: `README.md`
- Modify: `app/docs/page.tsx`
- Modify: `app/bridge/layout.tsx`
- Modify: `src/components/common/AppSidebar.tsx`
- Modify: `.env.example` only around bridge RPC variables, preserving unrelated user edits

- [ ] **Step 1: Write a failing copy audit**

Extend `test/product-surface.test.ts` to assert current product files contain `Avalanche Fuji`, `Arbitrum Sepolia`, and `Optimism Sepolia`, and contain neither `Solana` nor an Analytics navigation or feature claim.

- [ ] **Step 2: Run the audit and verify RED**

Run: `npx tsx --test test/product-surface.test.ts`

Expected: failure on stale Solana and Analytics copy.

- [ ] **Step 3: Rewrite the README and in app docs**

Describe the six EVM bridge networks, Circle CCTP V2 flow, source chain switching, required native testnet gas, official testnet USDC, route estimation, destination address handling, retries, and explorers. Remove the Analytics section and all Solana setup.

- [ ] **Step 4: Update application copy and environment examples**

Update bridge metadata, homepage network names, and sidebar networks. Add Fuji, Arbitrum, and Optimism public RPC configuration where the runtime reads it. Do not alter unrelated existing `.env.example` work.

- [ ] **Step 5: Verify the copy audit GREEN**

Run: `npx tsx --test test/product-surface.test.ts`

Expected: all copy assertions pass.

### Task 5: End To End Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Verify no active Solana or Analytics implementation remains**

Run: `rg -n "solana|Solana|/analytics|Analytics" app src package.json README.md --glob '!docs/superpowers/**'`

Expected: no product implementation references. Historical design documents may retain historical context.

- [ ] **Step 2: Run all automated checks**

Run: `npm run test:api`

Run: `npm test` with a valid local dummy Hardhat key when `.env` contains a placeholder.

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits zero.

- [ ] **Step 3: Run local bridge page checks**

Start the app on an unused port. Confirm `/bridge` renders six selectable EVM networks, Fuji, Arbitrum, and Optimism wallet add metadata is valid, route query parameters survive reload, and `/analytics` returns the Next.js not found page. Confirm no browser console errors occur before wallet connection.

- [ ] **Step 4: Review final diff and commit**

Stage only intended files, preserve unrelated user changes, and use a scoped commit message such as:

```text
feat: refresh bridge networks and remove analytics
```
