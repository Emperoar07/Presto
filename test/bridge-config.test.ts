import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRIDGE_NETWORKS,
  BRIDGE_USDC_ADDRESSES,
  CCTP_DOMAIN_IDS,
  EVM_NETWORK_PARAMS,
  NETWORKS,
  getExplorerBase,
  getTransferSpeed,
  isBridgeNetworkKey,
  isValidBridgeHistoryItem,
  isValidTxHash,
} from '../src/components/bridge/constants';

const networks = NETWORKS as Record<string, { bridgeChain: string; chainId: number; ecosystem: string }>;
const usdc = BRIDGE_USDC_ADDRESSES as Record<string, string>;
const domains = CCTP_DOMAIN_IDS as Record<string, number>;
const params = EVM_NETWORK_PARAMS as Record<string, { chainId: string; nativeCurrency: { symbol: string } }>;
const EVM_HASH = `0x${'a'.repeat(64)}`;

test('configures the complete EVM bridge network list', () => {
  assert.deepEqual(BRIDGE_NETWORKS, [
    'arc',
    'ethereum-sepolia',
    'base-sepolia',
    'avalanche-fuji',
    'arbitrum-sepolia',
    'optimism-sepolia',
  ]);
  assert.equal(isBridgeNetworkKey('solana-devnet'), false);
  assert.equal(isBridgeNetworkKey('avalanche-fuji'), true);
  assert.equal(isBridgeNetworkKey('arbitrum-sepolia'), true);
  assert.equal(isBridgeNetworkKey('optimism-sepolia'), true);
});

test('uses a Circle supported transfer speed for every source chain', () => {
  assert.equal(getTransferSpeed('arc'), 'SLOW');
  assert.equal(getTransferSpeed('avalanche-fuji'), 'SLOW');
  assert.equal(getTransferSpeed('ethereum-sepolia'), 'FAST');
  assert.equal(getTransferSpeed('base-sepolia'), 'FAST');
  assert.equal(getTransferSpeed('arbitrum-sepolia'), 'FAST');
  assert.equal(getTransferSpeed('optimism-sepolia'), 'FAST');
});

test('uses Circle CCTP identifiers and official USDC contracts', () => {
  assert.ok(networks['avalanche-fuji']);
  assert.equal(networks['avalanche-fuji'].bridgeChain, 'Avalanche_Fuji');
  assert.equal(networks['avalanche-fuji'].chainId, 43113);
  assert.equal(networks['avalanche-fuji'].ecosystem, 'evm');
  assert.equal(domains['avalanche-fuji'], 1);
  assert.equal(usdc['avalanche-fuji'], '0x5425890298aed601595a70AB815c96711a31Bc65');

  assert.equal(networks['arbitrum-sepolia'].bridgeChain, 'Arbitrum_Sepolia');
  assert.equal(networks['arbitrum-sepolia'].chainId, 421614);
  assert.equal(networks['arbitrum-sepolia'].ecosystem, 'evm');
  assert.equal(domains['arbitrum-sepolia'], 3);
  assert.equal(usdc['arbitrum-sepolia'], '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d');

  assert.equal(networks['optimism-sepolia'].bridgeChain, 'Optimism_Sepolia');
  assert.equal(networks['optimism-sepolia'].chainId, 11155420);
  assert.equal(networks['optimism-sepolia'].ecosystem, 'evm');
  assert.equal(domains['optimism-sepolia'], 2);
  assert.equal(usdc['optimism-sepolia'], '0x5fd84259d66Cd46123540766Be93DFE6D43130D7');
});

test('provides wallet switch metadata and explorers for the new networks', () => {
  assert.equal(params['avalanche-fuji'].chainId, '0xa869');
  assert.equal(params['avalanche-fuji'].nativeCurrency.symbol, 'AVAX');
  assert.equal(getExplorerBase('avalanche-fuji' as never), 'https://testnet.snowtrace.io/tx/');

  assert.equal(params['arbitrum-sepolia'].chainId, '0x66eee');
  assert.equal(params['arbitrum-sepolia'].nativeCurrency.symbol, 'ETH');
  assert.equal(getExplorerBase('arbitrum-sepolia' as never), 'https://sepolia.arbiscan.io/tx/');

  assert.equal(params['optimism-sepolia'].chainId, '0xaa37dc');
  assert.equal(params['optimism-sepolia'].nativeCurrency.symbol, 'ETH');
  assert.equal(getExplorerBase('optimism-sepolia' as never), 'https://sepolia-optimism.etherscan.io/tx/');
});

test('accepts EVM history for new networks and rejects removed Solana history', () => {
  const baseItem = {
    id: 'bridge-1',
    createdAt: 1,
    amount: '1',
    sourceKey: 'avalanche-fuji',
    destinationKey: 'arbitrum-sepolia',
    state: 'pending',
    steps: [{ name: 'burn', txHash: EVM_HASH }],
  };

  assert.equal(isValidTxHash(EVM_HASH, 'avalanche-fuji' as never), true);
  assert.equal(isValidBridgeHistoryItem(baseItem), true);
  assert.equal(isValidBridgeHistoryItem({ ...baseItem, sourceKey: 'solana-devnet' }), false);
});
