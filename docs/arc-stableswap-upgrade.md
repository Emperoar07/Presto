# Arc StableSwap Upgrade Plan

## Goal

Reduce price impact for larger Arc stablecoin trades by replacing the current constant-product hub routing for stable pairs with an Arc-specific stable-swap engine.

This upgrade is intended for:

- `USDC`
- `EURC`
- `USDT`
- `WUSDC`

## Why the Current Model Tops Out

The live Arc contract, [`contracts/ArcHubAMMNormalized.sol`](C:/Users/bolaj/tempo-mini-dex/contracts/ArcHubAMMNormalized.sol), fixed mixed-decimal support, but it still uses constant-product pricing.

That means:

- every cross-stable route compounds slippage across hub hops
- larger trades move too far off peg
- the `EURC / USDC` side becomes the main bottleneck for `EURC -> USDT` and `EURC -> WUSDC`
- adding liquidity helps, but only linearly and expensively

For stablecoin-heavy routing, constant-product is the wrong long-term curve.

## Recommended Architecture

Keep two Arc liquidity engines:

1. `ArcStableSwapPool`
   - for stable-vs-stable execution
   - optimized around near-peg assets
   - handles large trades with lower slippage than x*y=k

2. `ArcHubAMMNormalized`
   - keep as fallback / compatibility engine
   - use for non-stable or unsupported routes if needed

This keeps the current live Arc deployment usable while letting stable pairs move to a better invariant.

## Contract Direction

### Option to Prefer

Build a single Arc stable pool for a basket of approved stable assets:

- `USDC`
- `EURC`
- `USDT`
- `WUSDC`

This is better than separate pairwise stable pools because:

- one pool concentrates liquidity
- cross-stable routing becomes one-hop inside the pool
- LP capital is shared across the stable basket

### Core Contract Shape

Suggested contract:

- `contracts/ArcStableSwapPool.sol`

Suggested responsibilities:

- register supported stable tokens and decimals
- normalize balances internally to a common precision
- maintain a stable-swap invariant with amplification `A`
- support:
  - `addLiquidity(uint256[] amounts, uint256 minLpOut, uint256 deadline)`
  - `removeLiquidity(uint256 lpAmount, uint256[] minAmountsOut, uint256 deadline)`
  - `removeLiquidityOneToken(uint256 lpAmount, address tokenOut, uint256 minAmountOut, uint256 deadline)`
  - `swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline)`
  - `getQuote(address tokenIn, address tokenOut, uint256 amountIn)`
  - `getVirtualPrice()`
  - `balances(address token)`
  - `lpBalanceOf(address provider)`

### Stable-Swap Requirements

The implementation should include:

- amplification parameter `A`
- fee parameter
- internal normalization for 6-decimal and 18-decimal assets
- slippage protection on all state-changing functions
- pause/unpause
- owner-governed token allowlist for the stable basket
- event coverage for swaps and liquidity changes

### Important Simplicity Constraint

Do not make the first version fully generic.

Prefer:

- fixed stable token set for Arc testnet
- explicit token list in constructor or immutable config

That reduces complexity and testing surface.

## Frontend Routing Changes

### Swap Page

Current Arc swap path in [`src/components/swap/SwapCardEnhanced.tsx`](C:/Users/bolaj/tempo-mini-dex/src/components/swap/SwapCardEnhanced.tsx) assumes hub-based reserve reads and hub-based price impact logic.

That should change to:

1. if both `tokenIn` and `tokenOut` are Arc stable tokens supported by the stable pool:
   - quote via `ArcStableSwapPool.getQuote`
   - execute via `ArcStableSwapPool.swap`
   - compute price impact from stable-pool virtual price / quote delta

2. otherwise:
   - fall back to current `ArcHubAMMNormalized`

### Liquidity Page

Current Arc liquidity UI in [`src/components/liquidity/LiquidityCard.tsx`](C:/Users/bolaj/tempo-mini-dex/src/components/liquidity/LiquidityCard.tsx) is still pair-oriented against `USDC`.

For stable-swap:

- replace Arc stable liquidity with basket-style deposit UI
- allow multi-token deposits
- allow single-token withdraw
- surface pool share instead of pair-specific LP share

Tempo liquidity should remain unchanged.

### Portfolio Page

Arc portfolio should show:

- stable pool LP balance
- withdrawable basket share

instead of separate pair LP rows for stable assets.

### Analytics Page

Arc analytics should show:

- basket TVL
- stable volume
- stable swap count
- virtual price
- token balances inside the pool

instead of pretending there is an orderbook or pair-by-pair stable market surface.

## Config Changes

Add a new Arc stable-swap address to config:

- `NEXT_PUBLIC_ARC_STABLESWAP_ADDRESS_5042002`

Then extend [`src/config/contracts.ts`](C:/Users/bolaj/tempo-mini-dex/src/config/contracts.ts) with:

- `ARC_STABLESWAP_ADDRESS`

Do not overload `HUB_AMM_ADDRESS` for this.

Keep both contracts explicitly addressable.

## Migration Plan

### Phase 1

Deploy the new stable pool without touching the current Arc hub AMM.

### Phase 2

Seed the stable pool with:

- `USDC`
- `EURC`
- `USDT`
- `WUSDC`

Target balanced seed values in human units, not raw units.

### Phase 3

Switch Arc swap routing:

- stable-to-stable goes to `ArcStableSwapPool`
- unsupported paths still use `ArcHubAMMNormalized`

### Phase 4

Update Arc liquidity UI to stable-pool deposits.

### Phase 5

Deprecate stable liquidity adds on the old hub pools.

Do not necessarily remove the old pools immediately. Let them remain withdrawable.

## Test Plan

Add a dedicated test file:

- `test/ArcStableSwapPool.test.ts`

Minimum coverage:

1. mixed-decimal initialization
2. balanced deposit
3. imbalanced deposit
4. large stable swap near peg
5. single-token withdrawal
6. multi-token withdrawal
7. quote accuracy against execution
8. pause behavior
9. slippage protection
10. virtual price sanity

Add frontend checks for:

- Arc defaults to stable pool when disconnected
- quote path selection is stable-pool first
- approvals still work
- loading state correctly distinguishes approval vs swap

## Rollout Order

Recommended sequence:

1. implement `ArcStableSwapPool.sol`
2. add tests
3. add deploy script
4. deploy to Arc testnet
5. seed balanced liquidity
6. wire Arc swap quoting/execution
7. wire Arc liquidity UI
8. wire Arc portfolio/analytics summaries
9. smoke test end-to-end

## Acceptance Criteria

This upgrade is successful when:

- `USDC <-> EURC`, `USDC <-> USDT`, `USDC <-> WUSDC` have visibly lower slippage on medium trades
- `EURC <-> USDT`, `EURC <-> WUSDC`, `USDT <-> WUSDC` route in one stable pool instead of hub-compounding
- Arc swap no longer depends on pairwise hub depth for stable-only routes
- liquidity UI matches the actual stable pool model
- portfolio and analytics no longer imply pair-specific Arc stable LP semantics

## Recommendation

Implement this as an Arc-only upgrade.

Do not try to merge Tempo and Arc liquidity designs into one abstraction yet. Tempo and Arc now have meaningfully different protocol behavior, and keeping that separation will make both the contracts and the UI easier to reason about.
