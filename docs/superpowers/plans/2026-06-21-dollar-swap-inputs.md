# Dollar Amount Swap Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type either token quantity or USD value on both the source and destination swap fields.

**Architecture:** Add a small token-pricing module for stablecoins and cirBTC, extend the SynRoute client to support exact-output quotes, and update `SwapCardEnhanced` so exact-input and exact-output flows share normalized token amounts internally. Local exact-output fallback uses bounded quote search over exact-input quotes when a native exact-output route is unavailable.

**Tech Stack:** Next.js App Router, React state/effects, wagmi/viem, SynRoute quote API.

---

### Task 1: Token USD Pricing Helper

**Files:**
- Create: `src/lib/tokenPrices.ts`
- Modify: none

- [ ] **Step 1: Add token pricing helpers**

Create `src/lib/tokenPrices.ts` with stablecoin fixed pricing, cirBTC browser/server price fetch, and conversion helpers.

- [ ] **Step 2: Verify with TypeScript**

Run: `npx.cmd tsc --noEmit`
Expected: PASS.

### Task 2: SynRoute Exact Output Support

**Files:**
- Modify: `src/lib/synroute.ts`

- [ ] **Step 1: Extend quote request type**

Allow `tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT'` in `getSynRouteQuote`.

- [ ] **Step 2: Verify with TypeScript**

Run: `npx.cmd tsc --noEmit`
Expected: PASS.

### Task 3: Swap Card Bidirectional Inputs

**Files:**
- Modify: `src/components/swap/SwapCardEnhanced.tsx`

- [ ] **Step 1: Add state**

Track input/output display mode (`token` or `usd`), editable output amount, normalized token amounts, and quote direction.

- [ ] **Step 2: Implement conversion and exact-output quoting**

Use token price helpers to convert USD inputs to token quantities. Use SynRoute exact-output on Arc where available. Use bounded binary search over local exact-input quotes for fallback.

- [ ] **Step 3: Update UI controls**

Add compact `Token | USD` toggles to both panels. Make destination input writable. Keep existing balance, max, route, slippage, and submit behavior intact.

- [ ] **Step 4: Verify**

Run: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build`.
Expected: all pass.
