import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSynRouteBody } from '../app/api/synroute/_utils';

const baseQuote = {
  chainId: 5042002,
  tokenIn: '0x3600000000000000000000000000000000000000',
  tokenOut: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
  amount: '1000000',
  tradeType: 'EXACT_INPUT',
};

test('accepts a valid Arc SynRoute quote payload', () => {
  assert.equal(validateSynRouteBody('quote', baseQuote), null);
});

test('rejects SynRoute payloads outside Arc Testnet', () => {
  assert.equal(
    validateSynRouteBody('quote', { ...baseQuote, chainId: 1 }),
    'SynRoute is only enabled on Arc Testnet',
  );
});

test('rejects malformed swap payloads before proxying', () => {
  assert.equal(
    validateSynRouteBody('swap', {
      ...baseQuote,
      sender: 'not-an-address',
      recipient: '0x3600000000000000000000000000000000000000',
      approvalMode: 'erc20',
      slippageBps: 50,
    }),
    'sender must be an EVM address',
  );
});
