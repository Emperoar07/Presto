# Presto Markets Handoff

## Product Direction

Presto Markets is a separate product and separate repo from Presto DEX.

The core idea is a public Arc Testnet market platform for:

- Prediction markets
- Opinion markets
- Opportunity markets

The product line is:

> Your opinions. Your opportunities. Your predictions.

Opportunity markets do not need to be private on Arc. Do not use Arcium or confidential compute for the first version. Keep the first version public, simple, and composable.

## Relationship To Presto DEX

Presto Markets should be a separate local repo and separate GitHub repo.

Presto DEX remains the swap, bridge, liquidity, send, deploy, portfolio, and analytics app.

Presto Markets should reuse the original Presto color branding and UI language:

- Dark navy app shell
- Cyan primary action color
- Rounded structured panels
- Low-glass, solid card surfaces
- Same logo direction
- Same general spacing and typography rhythm

The DEX now has a Markets link in the app topbar and landing nav. It uses:

```bash
NEXT_PUBLIC_PRESTO_MARKETS_URL=https://presto-markets.vercel.app
```

When the real Markets deployment URL is available, update this env var in Vercel.

## What Arc App Kit Is For

Arc App Kit should be treated as product rails, not the core market engine.

Use App Kit for:

- USDC movement
- Send flows
- Bridge flows
- Swap or funding flows
- Unified balance later if useful

Do not expect App Kit to replace the custom prediction market contracts.

The Markets protocol should be custom contracts on Arc.

Useful Arc docs:

- https://docs.arc.network/app-kit
- https://docs.arc.network/app-kit/send
- https://docs.arc.network/app-kit/bridge
- https://docs.arc.network/app-kit/swap
- https://docs.arc.network/ai/mcp

Use Arc MCP for major architecture or implementation decisions.

## Arc MCP Setup

The next chat should use Arc MCP whenever we make major architecture, contract, wallet, bridge, swap, or Arc specific decisions.

Arc MCP server:

```text
https://docs.arc.network/mcp
```

Cursor setup:

```json
{
  "mcpServers": {
    "arc-docs": {
      "url": "https://docs.arc.network/mcp"
    }
  }
}
```

VS Code Copilot setup:

```json
{
  "servers": {
    "arc-docs": {
      "type": "http",
      "url": "https://docs.arc.network/mcp"
    }
  }
}
```

Claude Code setup:

```bash
claude mcp add --transport http arc-docs https://docs.arc.network/mcp
```

Useful MCP prompt for the next chat:

```text
Use the Arc MCP docs before making architecture decisions for Presto Markets. Search Arc App Kit, Arc smart contract standards, USDC flows, bridge flows, and AI agent docs when they matter. Keep Presto Markets public for V1 and avoid privacy or Arcium unless explicitly requested later.
```

## Market Types

### Prediction Markets

Used for questions with an eventual objective outcome.

Examples:

- Will X happen by a specific date?
- Will a protocol hit a target TVL?
- Will a token or project launch by a deadline?

Expected flow:

- User creates a market
- Users buy outcome shares
- Market closes
- Outcome resolves
- Winners redeem

### Opinion Markets

Used for sentiment, preference, belief, and social conviction.

Examples:

- Which product direction should win?
- Which project has the strongest community?
- Which launch idea is most exciting?

These may use voting, staking, or weighted outcome shares instead of strict real-world resolution.

### Opportunity Markets

Used for public opportunity discovery.

Examples:

- Which Arc startup idea should be built next?
- Which grant proposal deserves funding?
- Which ecosystem opportunity has the best upside?

This is not private deal flow. Keep it public.

Opportunity markets should feel like a mix of:

- Prediction market
- Curation market
- Startup or opportunity discovery board

## V1 Contract Scope

Start small and secure.

Suggested contracts:

- `PrestoMarketFactory`
- `PrestoMarket`
- `OutcomeToken` or ERC1155 style position token
- `MarketTreasury`
- Optional `MarketResolver`

V1 should support:

- Market creation
- Binary outcomes first
- USDC collateral first
- Public market metadata
- Market close time
- Creator address
- Resolver address
- Simple resolution
- Winner redemption

Avoid too much complexity in V1:

- No private markets
- No advanced oracle network
- No AI autonomous resolution at launch
- No complicated fee routing before the happy path works

## Later Contract Scope

After V1 works:

- Multi-outcome markets
- Creator fees
- Protocol fees
- USYC yield-bearing markets
- Dispute windows
- Resolver bonds
- AI assisted resolution
- Agent based resolution using Arc agent standards

## Yield-Bearing Market Idea

Presto DEX already uses USYC in rewards.

For Presto Markets, USYC can become a differentiator:

- Users deposit USYC into markets
- Locked USYC accrues yield while the market is open
- Winners receive payout plus yield share

This should not be V1 unless the accounting is carefully reviewed.

## UI Pages For First Build

### Landing Page

Different from Presto DEX landing page, but same brand.

Possible hero:

```text
Presto Markets
Your opinions. Your opportunities. Your predictions.
```

Supporting copy:

```text
Create and trade public markets on Arc. Forecast outcomes, surface opportunities, and turn conviction into liquid positions.
```

Primary actions:

- Explore Markets
- Create Market

### Explore Markets

Show market cards with:

- Market title
- Market type
- Category
- Outcome odds
- Volume
- Liquidity
- Close date
- Status

Filters:

- All
- Predictions
- Opinions
- Opportunities
- Active
- Closing soon
- Resolved

### Create Market

Flow:

- Choose market type
- Enter title
- Enter description
- Choose category
- Add outcomes
- Set close time
- Set resolution rules
- Choose collateral token
- Seed liquidity if needed
- Review and create

### Market Detail

Show:

- Market question
- Outcome cards
- Buy or sell panel
- Market details
- Rules
- Activity
- Resolution status

### Portfolio

Show:

- Open positions
- Resolved claimable positions
- Created markets
- PnL later

## Data Model

Initial app data can come from:

- Contract reads
- Contract events
- Local cache for better UX
- API route indexer later

Important events:

- `MarketCreated`
- `SharesBought`
- `SharesSold`
- `MarketResolved`
- `RewardsClaimed`

## Design Notes

Presto Markets should feel related to Presto DEX but not identical.

Keep:

- Cyan primary
- Dark Arc native feeling
- Solid cards, not heavy glass
- Compact panel designs
- Clear action buttons

Differentiate with:

- More editorial landing copy
- Market cards
- Outcome probability visuals
- Category tags
- Creator and resolver identity surfaces

## Important Product Decisions

Use public Arc markets first.

Start with USDC collateral first.

Do not redeploy or modify Presto DEX contracts for Markets.

Do not make Markets dependent on DEX internals.

DEX can link to Markets.

Markets can later link back to DEX for funding, swapping, or bridging.

## Next Chat Starting Prompt

Use this prompt in the new chat:

```text
We are starting Presto Markets as a separate repo from Presto DEX.

Read devnote.md first. Presto Markets is a public Arc Testnet market platform for prediction markets, opinion markets, and opportunity markets. It should reuse Presto DEX branding and UI language, but have a different landing page and product copy.

Use Arc MCP for major Arc architecture choices. Do not use privacy or Arcium for V1. Build the plan and then scaffold the new local repo safely.
```
