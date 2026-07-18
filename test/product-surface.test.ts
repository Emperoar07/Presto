import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('removes the analytics product surface and API', () => {
  assert.equal(existsSync(join(root, 'app/analytics')), false);
  assert.equal(existsSync(join(root, 'app/api/analytics')), false);
  assert.equal(existsSync(join(root, 'src/components/analytics')), false);
  assert.equal(existsSync(join(root, 'data/analytics.json')), false);

  for (const path of ['src/components/common/AppSidebar.tsx', 'src/components/common/PageTopbar.tsx', 'app/page.tsx']) {
    assert.doesNotMatch(read(path), /\/analytics|Analytics/);
  }
});

test('exposes the six supported EVM bridge networks in product copy', () => {
  const copy = [read('README.md'), read('app/docs/page.tsx'), read('app/page.tsx')].join('\n');
  assert.match(copy, /Avalanche Fuji/);
  assert.match(copy, /Arbitrum Sepolia/);
  assert.match(copy, /Optimism Sepolia/);
  assert.doesNotMatch(copy, /Solana/i);
});

test('does not ship Solana bridge dependencies', () => {
  const packageJson = read('package.json');
  assert.doesNotMatch(packageJson, /adapter-solana|@solana\//);
});

test('registers every bridge EVM chain with wagmi', () => {
  const wagmi = read('src/config/wagmi.ts');
  for (const chain of ['avalancheFuji', 'arbitrumSepolia', 'optimismSepolia']) {
    assert.match(wagmi, new RegExp(`\\[${chain}\\.id\\]`));
  }
});

test('does not let stale URL state overwrite a selected bridge source', () => {
  const workspace = read('src/components/bridge/BridgeWorkspace.tsx');
  assert.match(workspace, /\}, \[searchParams\]\);/);
  assert.doesNotMatch(workspace, /\[destinationKey, searchParams, sourceKey\]/);
});

test('configures automatic cirBTC LP rewards without changing the swap fee', () => {
  const contracts = read('src/config/contracts.ts');
  const pools = read('src/components/liquidity/UniswapForkPools.tsx');

  assert.match(contracts, /CIRBTC_LIQUIDITY_REWARDS_ABI/);
  assert.match(contracts, /NEXT_PUBLIC_CIRBTC_REWARDS_ADDRESS/);
  assert.match(contracts, /activateWithPermit/);
  assert.match(contracts, /claimableOf/);
  assert.match(pools, /Activate 1% Rewards/);
  assert.match(pools, /0\.3% swap fee/);
  assert.match(pools, /1% USYC APR/);
  assert.match(pools, /Claim USYC/);
});
