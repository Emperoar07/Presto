# cirBTC USYC Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic 1 percent USYC APR rewards to cirBTC and USDC liquidity while preserving the real 0.3 percent Uniswap V2 swap fee.

**Architecture:** A dedicated `CirBtcLiquidityRewards` contract holds activated pair LP tokens, manages new liquidity through the existing router, and accounts for USYC rewards from recorded USDC principal. Existing LP holders activate with the pair permit in one transaction. The fork liquidity component reads and writes this contract while existing Hub rewards remain unchanged.

**Tech Stack:** Solidity 0.8.20, OpenZeppelin SafeERC20 and ReentrancyGuard, Hardhat, ethers, React, wagmi, viem, Next.js, TypeScript

---

### Task 1: Contract Behavior

**Files:**
- Create: `contracts/CirBtcLiquidityRewards.sol`
- Create: `test/CirBtcLiquidityRewards.test.ts`

- [ ] **Step 1: Write the failing deployment and configuration tests**

Test constructor rejection of zero addresses, immutable USYC, token, USDC, pair, and router values, and `rewardRateBps()` equal to `100`.

- [ ] **Step 2: Run the focused contract test and verify failure**

Run: `npx hardhat test --config hardhat.config.cjs test/CirBtcLiquidityRewards.test.ts`

Expected: failure because `CirBtcLiquidityRewards` does not exist.

- [ ] **Step 3: Implement contract configuration and reward state**

Create immutable contract references and these public values:

```solidity
uint256 public constant SECONDS_PER_YEAR = 365 days;
uint256 public constant REWARD_RATE_BPS = 100;
mapping(address => uint256) public stakedLp;
mapping(address => uint256) public principalUsdc;
mapping(address => uint256) public pendingRewards;
mapping(address => uint256) public lastCheckpoint;
```

Add `_checkpoint(address user)` and `claimableOf(address user)` using recorded principal, elapsed seconds, 100 basis points, and six decimal USYC units.

- [ ] **Step 4: Write failing activation tests**

Cover `activateWithPermit`, regular `activate`, expired permit rejection, zero amount rejection, and principal based on twice the USDC reserve share.

- [ ] **Step 5: Implement existing LP activation**

Use this interface:

```solidity
function activate(uint256 lpAmount) external;
function activateWithPermit(
    uint256 lpAmount,
    uint256 permitDeadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

Checkpoint first, transfer LP to the contract, calculate principal against pair reserves and total supply, then credit `stakedLp` and `principalUsdc`.

- [ ] **Step 6: Write failing automatic deposit tests**

Cover token transfers, router allowance, minted LP balance delta, unused token refunds, slippage rejection, deadline rejection, LP credit, principal credit, and immediate checkpoint creation.

- [ ] **Step 7: Implement automatic deposit**

Use this interface:

```solidity
function addLiquidity(
    uint256 cirBtcDesired,
    uint256 usdcDesired,
    uint256 cirBtcMin,
    uint256 usdcMin,
    uint256 deadline
) external returns (uint256 cirBtcUsed, uint256 usdcUsed, uint256 lpMinted);
```

Transfer desired amounts from the provider, approve the configured router, mint LP to the rewards contract, refund unused amounts, and record the position.

- [ ] **Step 8: Write failing claim and removal tests**

Cover elapsed reward accrual, repeated checkpointing, same USYC token payout, insufficient funding, partial removal, full removal, proportional principal reduction, pending reward preservation, and minimum amount enforcement.

- [ ] **Step 9: Implement claim and removal**

Use these interfaces:

```solidity
function claim() external returns (uint256 amount);
function removeLiquidity(
    uint256 lpAmount,
    uint256 cirBtcMin,
    uint256 usdcMin,
    uint256 deadline
) external returns (uint256 cirBtcOut, uint256 usdcOut);
```

Checkpoint and update all accounting before external calls. Approve the router for only the removal amount and send both underlying tokens directly to the provider.

- [ ] **Step 10: Run contract tests and commit**

Run the focused test until all reward, activation, deposit, claim, and removal cases pass.

Commit: `feat: add cirBTC LP rewards contract`

### Task 2: Contract Configuration And Hooks

**Files:**
- Modify: `src/config/contracts.ts`
- Modify: `src/lib/tempo.ts`
- Test: `test/product-surface.test.ts`

- [ ] **Step 1: Write failing configuration tests**

Assert that Arc exposes `CIRBTC_REWARDS_ADDRESS`, the rewards ABI includes every read and write method, and the configured address can be overridden with `NEXT_PUBLIC_CIRBTC_REWARDS_ADDRESS`.

- [ ] **Step 2: Add configuration and ABI**

Add `CIRBTC_LIQUIDITY_REWARDS_ABI` with `stakedLp`, `principalUsdc`, `pendingRewards`, `lastCheckpoint`, `claimableOf`, `rewardRateBps`, `activate`, `activateWithPermit`, `addLiquidity`, `removeLiquidity`, and `claim`.

- [ ] **Step 3: Add wagmi hooks**

Expose reads for reward position data and writes for activate, add, remove, and claim. Every write must use the connected wallet chain and wait for the receipt before the component refreshes.

- [ ] **Step 4: Run application tests and commit**

Run: `npm run test:api`

Commit: `feat: configure cirBTC LP rewards`

### Task 3: Existing Position Activation

**Files:**
- Modify: `src/components/liquidity/UniswapForkPools.tsx`
- Modify: `src/config/contracts.ts`
- Test: `test/product-surface.test.ts`

- [ ] **Step 1: Write failing product surface tests**

Assert that the component presents `Activate 1% Rewards`, signs the pair permit with name `Tempo LPs`, version `1`, Arc chain id, pair address, current nonce, amount, and deadline, then calls `activateWithPermit`.

- [ ] **Step 2: Add pair permit reads**

Extend the pair ABI with `name`, `nonces`, `DOMAIN_SEPARATOR`, and `permit` so the app can build and validate typed permit data.

- [ ] **Step 3: Add reward position reads and activation command**

Read wallet LP and activated LP independently. Show the activation command only when wallet LP is positive. Request the permit signature and submit one activation transaction. Use the standard approval plus `activate` path only when typed signing is unavailable.

- [ ] **Step 4: Refresh state after activation**

Wait for the transaction receipt, refresh wallet LP, staked LP, principal, claimable USYC, and pool reserves, then show the existing transaction toast.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:api`

Commit: `feat: activate existing cirBTC LP rewards`

### Task 4: Automatic Rewards For New Liquidity

**Files:**
- Modify: `src/components/liquidity/UniswapForkPools.tsx`
- Test: `test/product-surface.test.ts`

- [ ] **Step 1: Write failing deposit flow test**

Assert that configured reward deployments route new liquidity through `CirBtcLiquidityRewards.addLiquidity` and never mint new LP directly to the wallet.

- [ ] **Step 2: Replace the fork add flow**

Approve cirBTC and USDC to the rewards contract, submit `addLiquidity` with the current desired amounts, one percent slippage minimums, and the existing twenty minute deadline. Use wallet batching for both approvals and the add call when supported.

- [ ] **Step 3: Preserve the direct router fallback only when rewards are unconfigured**

The released Arc configuration must always select the reward path. Keep the direct router code isolated for local development deployments without a rewards address.

- [ ] **Step 4: Refresh and verify automatic activation**

After receipt, confirm wallet LP did not increase, activated LP did increase, claimable reads succeed, and the form clears.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:api`

Commit: `feat: enroll new cirBTC liquidity in rewards`

### Task 5: Claim And Remove Experience

**Files:**
- Modify: `src/components/liquidity/UniswapForkPools.tsx`
- Test: `test/product-surface.test.ts`

- [ ] **Step 1: Write failing position card tests**

Assert separate `0.3% swap fee` and `1% USYC APR` labels, claimable USYC, `Claim USYC`, total LP, activated LP, and reward removal routing.

- [ ] **Step 2: Add reward details to My Positions**

Display total position LP as wallet LP plus activated LP. Display activated LP separately, preserve pool share and value calculations, and add the claimable reward panel using the same visual hierarchy as Hub positions.

- [ ] **Step 3: Add claim handling**

Disable claim when the amount is zero or a transaction is pending. Submit `claim`, wait for receipt, show the claimed USYC amount, then refresh reward and token balances.

- [ ] **Step 4: Route activated removal through rewards**

Remove activated LP through `CirBtcLiquidityRewards.removeLiquidity`. Continue to use the router only for unactivated wallet LP. Make the selected source explicit when both balances exist.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:api`

Commit: `feat: claim and remove rewarded cirBTC liquidity`

### Task 6: Arc Deployment

**Files:**
- Create: `scripts/deploy-cirbtc-liquidity-rewards.ts`
- Modify: `src/config/contracts.ts`
- Modify: `.env.local`
- Do not modify or stage the existing user change in `.env.example`

- [ ] **Step 1: Add deployment validation**

The script must read the pair from the existing factory, verify pair token addresses, verify the existing USYC token address, deploy with the current router, print all immutable values, and stop on any mismatch.

- [ ] **Step 2: Compile and run local deployment tests**

Run: `npm run compile`

Expected: Solidity compilation succeeds without warnings from project contracts.

- [ ] **Step 3: Deploy on Arc**

Run: `npx hardhat run scripts/deploy-cirbtc-liquidity-rewards.ts --network arc`

Record the transaction hash and deployed contract address.

- [ ] **Step 4: Fund with the same USYC token**

Transfer the configured testnet campaign amount from the deployer to the new rewards contract, wait for confirmation, then verify `contractBalance` and `usyc` on chain.

- [ ] **Step 5: Configure the application and commit**

Set the checked in Arc default address and local environment override to the verified deployment.

Commit: `deploy: configure cirBTC LP rewards on Arc`

### Task 7: Documentation And Release Verification

**Files:**
- Modify: `README.md`
- Modify: `app/docs/page.tsx`
- Modify: `docs/superpowers/specs/2026-07-18-cirbtc-usyc-rewards-design.md` only when deployed addresses clarify the final flow

- [ ] **Step 1: Update human product documentation**

Explain automatic rewards for new liquidity, one transaction activation for existing LP, the same USYC token, claim and removal behavior, the 1 percent APR, and the separate 0.3 percent swap fee.

- [ ] **Step 2: Run complete verification**

Run:

```text
npx hardhat test --config hardhat.config.cjs test/CirBtcLiquidityRewards.test.ts
npm run test:api
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: every command succeeds. The existing dependency warning in the production build may remain, but no project error is accepted.

- [ ] **Step 3: Run Arc smoke transactions**

Activate a small existing LP amount, read a nonzero activated balance, add new liquidity through the wrapper, advance through real chain time, claim USYC, and remove a small activated LP amount. Verify receipts and final balances.

- [ ] **Step 4: Review and push**

Review the final diff for secrets and unrelated files. Keep `.env.example` unstaged. Commit documentation and any final verified corrections, then push `main`.
