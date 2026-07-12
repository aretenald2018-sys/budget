import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferMarketFromTicker,
  mergeParsedAssetPositions,
  mergeSymbolItems,
  positionToHolding,
} from '../features/finance/assets/service.js';

test('asset screenshot positions preserve market and normalized holding shape', () => {
  const holding = positionToHolding({
    symbol: '005930',
    name: '삼성전자',
    quantity: 2,
    principalKRW: 140000,
    currentValueKRW: 150000,
  }, '2026-07-13');

  assert.equal(holding.symbol, '005930.KS');
  assert.equal(holding.market, 'KR');
  assert.equal(holding.avgPrice, 70000);
  assert.equal(holding.snapshotAt, '2026-07-13');
});

test('asset screenshot merge saves only changed tracks and skips duplicate holdings', async () => {
  const tracks = [{
    id: 'invest',
    holdings: [{ symbol: 'AAPL', name: 'Apple', broker: 'KB', currentValueKRW: 100000 }],
  }];
  const saved = [];
  const result = await mergeParsedAssetPositions({
    asOf: '2026-07-13',
    positions: [
      { symbol: 'AAPL', name: 'Apple', broker: 'KB', currentValueKRW: 101000 },
      { symbol: 'MSFT', name: 'Microsoft', broker: 'KB', currentValueKRW: 200000 },
    ],
  }, { 0: 'invest', 1: 'invest' }, tracks, async track => saved.push(track));

  assert.deepEqual(result, { added: 1, skipped: 1 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].holdings.length, 2);
  assert.equal(saved[0].holdings[1].symbol, 'MSFT');
});

test('ticker helpers retain deduplication and Korean exchange detection', () => {
  assert.equal(inferMarketFromTicker('005930', ''), 'KR');
  assert.equal(inferMarketFromTicker('AAPL', 'NASDAQ'), 'US');
  assert.deepEqual(mergeSymbolItems(
    [{ symbol: 'AAPL', name: 'Apple' }],
    [{ symbol: 'aapl', name: 'Apple Inc.' }, { symbol: 'MSFT', name: 'Microsoft' }],
  ).map(item => item.symbol), ['AAPL', 'MSFT']);
});
