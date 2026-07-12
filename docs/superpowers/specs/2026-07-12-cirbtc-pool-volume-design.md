# cirBTC Pool 24 Hour Volume Design

## Goal

Show the rolling 24 hour USDC swap volume for the deployed cirBTC and USDC Uniswap V2 fork pair on Arc Testnet. The number must represent swaps that touched this pair, because those are the swaps that generated fees for its liquidity providers.

## Decision

Index the pair contract's canonical Uniswap V2 `Swap` events through the server. Do not include SynRoute trades that execute elsewhere, liquidity additions, liquidity removals, transfers, or Hub AMM activity.

The deployed pair is discovered from the configured factory and token addresses instead of being duplicated as a hardcoded application constant.

## Data Flow

1. The pool stats server resolves the cirBTC and USDC pair through the configured Uniswap V2 factory.
2. It reads the current Arc block and finds the first block at or after the timestamp from 24 hours ago.
3. It requests only the pair's `Swap` topic in bounded block chunks.
4. It determines whether USDC is token zero or token one, then sums the USDC input or output amount for each swap exactly once.
5. It returns the raw six decimal USDC value, formatted display value, swap count, and update time with the existing pool stats response.
6. The cirBTC pool row, manager, and position view consume the same server value.

## Reliability

Arc produces sub second blocks, so the implementation must not assume a fixed number of blocks per day. Timestamp based boundary discovery keeps the window accurate as block cadence changes.

RPC queries use small chunks and configured endpoint failover. A short server cache prevents every browser poll from rescanning the same range. If refresh fails after a successful read, the last successful cached value remains available. A cold failure is shown as unavailable rather than as a real zero.

## Boundaries

The first version computes an exact rolling window from chain logs. It does not add a database, external indexer, webhook service, or Circle Smart Contract Platform dependency. The server interface remains narrow enough to replace the scanner with a persistent indexer later without changing the pool UI.

## Tests

Unit tests cover timestamp boundary selection, token zero and token one USDC accounting, exact input and exact output event shapes, empty windows, and formatting. An API level test verifies that fork volume is merged into the cirBTC pool without changing Hub pool values.

Manual verification compares the API result with a direct Arc log scan for the deployed pair. Type checking, linting, the complete test suite, and the production build run before completion.
