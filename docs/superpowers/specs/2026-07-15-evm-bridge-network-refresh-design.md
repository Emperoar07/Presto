# EVM Bridge Network Refresh

## Goal

Replace the unfinished Solana Devnet bridge integration with Avalanche Fuji and Arbitrum Sepolia. The bridge will support USDC transfers among Arc Testnet, Ethereum Sepolia, Base Sepolia, Avalanche Fuji, and Arbitrum Sepolia through Circle Bridge Kit and CCTP V2.

## Product Scope

Solana will be removed from the product completely. This includes the bridge selector, wallet connection flow, balance and receipt handling, transaction links, local history validation, source files, dependencies, environment examples, application copy, in app documentation, and README.

Existing local Solana bridge history will no longer pass validation and will not be shown. No migration is needed because these are testnet records stored only in the browser.

## Network Configuration

Avalanche Fuji will use:

* Bridge Kit chain `Avalanche_Fuji`
* EVM chain ID `43113`
* CCTP domain `1`
* USDC `0x5425890298aed601595a70AB815c96711a31Bc65`

Arbitrum Sepolia will use:

* Bridge Kit chain `Arbitrum_Sepolia`
* EVM chain ID `421614`
* CCTP domain `3`
* USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

Public Viem chain definitions will provide default RPC endpoints, native currencies, and explorer URLs. Optional public environment RPC values may override those defaults where the application already supports overrides.

## Wallet And Transfer Flow

All supported networks are EVM networks. One connected browser wallet supplies the Viem adapter for both Bridge Kit sides. The source network controls which chain the wallet must use before estimation and submission.

When the source changes, the application checks the connected chain and requests a switch. If the network is unknown to the wallet, the application adds it with its chain ID, native currency, RPC URL, and explorer before switching.

The destination defaults to the connected EVM wallet address. A valid custom EVM destination remains supported. Bridge Kit estimation, submission, retry, event tracking, and forwarding behavior remain unchanged.

## Code Removal

The implementation will remove:

* The Solana provider component and wrapper
* Solana wallet adapter state, picker, signing, and connection code
* Solana address, balance, signature, receipt, and explorer branches
* Solana bridge types and network entries
* Circle Solana adapter and Solana wallet adapter dependencies
* Solana environment variables and all product copy

The bridge page will render the workspace directly because no ecosystem specific provider is required.

## History And Recovery

Bridge history accepts only the five configured EVM networks. Receipt reconciliation uses a Viem public client for each network. Circle attestation lookup uses the source network CCTP domain. Retry creates fresh Viem adapters from the connected browser wallet.

The transaction history page and bridge history panel will use the configured EVM explorer for every supported source and destination.

## Documentation

The README and in app docs will describe the five supported EVM testnets, Circle Bridge Kit, CCTP V2, wallet chain switching, destination addresses, estimation, retries, and testnet funding requirements. Homepage copy, bridge metadata, and sidebar network labels will match the implemented network list.

## Analytics Removal

The Analytics product surface will be removed completely. This includes the `/analytics` route, its layout and dashboard component, its aggregate API route, navigation and top bar entries, homepage feature copy, in app documentation, README sections, and analytics only generated data files.

Shared pool, price, transaction, and indexer behavior used by Swap, Pools, Portfolio, or Activity will remain. The indexer will stop producing the unused analytics output while retaining order and transaction state required by active product surfaces.

## Testing

Tests will verify:

* The complete five network registry
* Bridge Kit chain names, chain IDs, CCTP domains, and official USDC addresses
* Network and route validation
* EVM transaction hash validation for every network
* Explorer URL selection
* History rejection for removed Solana records
* Wallet add and switch metadata for Fuji and Arbitrum Sepolia
* Absence of Analytics navigation, routes, and API output

Final verification will run bridge focused tests, all API tests, all contract tests, TypeScript, lint, and a production build. A local runtime check will confirm the bridge page renders the new network choices without Solana code or copy.
