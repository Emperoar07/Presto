# cirBTC USDC Rewards Design

## Purpose

cirBTC and USDC liquidity providers will earn the same USYC token used by the current Hub pools. The cirBTC campaign pays 1 percent APR. The Uniswap V2 swap fee remains 0.3 percent and is shown separately from the reward APR.

New liquidity enters the reward campaign automatically. Existing liquidity providers activate rewards with one wallet transaction. After activation, rewards appear under My Positions and can be claimed like the current pool rewards.

## Contracts

The new `CirBtcLiquidityRewards` contract combines liquidity management and reward accounting for one configured Uniswap V2 pair.

Its immutable configuration contains:

1. The existing USYC token address
2. The cirBTC token address
3. The USDC token address
4. The existing Uniswap V2 pair address
5. The existing Uniswap V2 router address

The contract holds activated LP tokens and records each provider's staked LP balance and USDC principal. The reward rate is fixed at 100 basis points, which equals 1 percent APR.

The existing `USYCRewards` contract remains responsible for Hub pool rewards at 0.5 percent APR. It is not replaced and its USYC token does not change.

## New Liquidity

The app sends new cirBTC and USDC deposits through `CirBtcLiquidityRewards`.

1. The contract transfers the selected token amounts from the provider.
2. The contract calls the existing router and receives the newly minted pair LP tokens.
3. The contract credits the LP tokens to the provider's reward position.
4. The contract records the provider's USDC principal from the pool reserves and LP share.
5. Reward accrual begins in the same transaction.

The provider does not see a separate stake action.

## Existing Positions

The app detects cirBTC and USDC pair LP tokens held in the connected wallet. My Positions shows an `Activate 1% Rewards` command when an unactivated balance exists.

The pair contract supports permit signatures. The app requests a permit signature and submits one activation transaction that transfers the approved LP amount into the rewards contract and starts accrual. A wallet that cannot sign the permit uses wallet batching when available, with a standard approval flow as the compatibility path.

Activation never changes the provider's proportional pool ownership. It changes custody of the LP token while the rewards contract records the provider as its owner.

## Reward Accounting

Rewards are denominated and paid in the existing six decimal USYC token.

The contract records USDC principal when LP tokens enter the campaign. The principal equals twice the provider's USDC reserve share at that moment. This represents the full two sided position value without treating later reserve movement as if it existed for the entire accrual period.

Before every deposit, activation, removal, or claim, the contract checkpoints earned rewards using:

`principal multiplied by 100 basis points multiplied by elapsed seconds divided by 10000 divided by 365 days`

Removing part of a position reduces principal proportionally. Adding liquidity records additional principal from the new deposit. Pending rewards remain claimable after any partial or full removal.

## Claim And Removal

My Positions displays:

1. Total LP balance
2. Activated LP balance
3. Pool share
4. Estimated position value
5. Verified 24 hour volume
6. `0.3% swap fee`
7. `1% USYC APR`
8. Claimable USYC

`Claim USYC` checkpoints the position and transfers USYC to the connected wallet. The token address is the same address used by every current reward card.

Removing activated liquidity calls the rewards contract. It checkpoints rewards, reduces the provider's position, removes liquidity through the existing router, and sends cirBTC and USDC directly to the provider. Wallet LP that has not been activated can still use the existing removal path.

## Safety

The contract uses safe token transfers and reentrancy protection. It accepts only the configured pair, router, cirBTC, USDC, and USYC contracts. Deposit and removal calls include minimum token amounts and a deadline supplied by the app.

Permit activation verifies the signer, amount, nonce, and deadline through the pair contract. Reward accounting changes before external token transfers. Claims fail when the distributor is not sufficiently funded and never reduce a provider's pending amount before all checks pass.

The deployment script verifies every configured contract address on Arc before funding rewards. It also confirms that the reward token address exactly matches the current USYC reward token.

## Application Flow

The existing fork pool component reads wallet LP, activated LP, principal, claimable USYC, and pending rewards together. New hooks use the connected Arc wallet provider and the current RPC fallback configuration.

After deposit, activation, removal, or claim, the app waits for the receipt and refreshes pair reserves, LP balances, reward balances, and pool statistics. Transaction messages use the same toast and explorer link pattern as the current liquidity actions.

The pool list describes the pair as `Uniswap V2 · 0.3% swap fee · 1% USYC APR`. The reward percentage is never presented as the swap fee.

## Testing

Contract tests cover new deposits, permit activation, reward accrual, partial removal, full removal, claims, repeated claims, principal changes, insufficient reward funding, expired permits, slippage protection, ownership controls, and reentrancy resistance.

Application tests cover contract configuration, the distinct fee and APR labels, existing position activation, automatic enrollment for new deposits, claim refresh, removal routing, unsupported wallet fallback, and preservation of the existing Hub reward experience.

The release check includes contract tests, focused application tests, TypeScript, lint, production build, and an Arc testnet transaction for activation, accrual, claim, and removal.

## Deployment

1. Deploy `CirBtcLiquidityRewards` with the current USYC, cirBTC, USDC, pair, and router addresses.
2. Fund it with the existing USYC token.
3. Verify the immutable addresses and the 100 basis point reward rate on Arc.
4. Add the deployed rewards address to application configuration and deployment environment variables.
5. Activate a small existing LP position and verify its claimable balance.
6. Add new liquidity through the wrapper and verify automatic enrollment.
7. Claim USYC and remove a portion of liquidity.
8. Update the app documentation and README with the final verified flow and addresses.
