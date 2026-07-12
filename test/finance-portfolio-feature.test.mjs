import assert from 'node:assert/strict';
import test from 'node:test';

import {
  portfolioAlignment,
  portfolioPolicyCard,
} from '../features/finance/portfolio/index.js';

test('finance portfolio feature excludes deposits and classifies operating assets', () => {
  const portfolio = {
    rows: [
      {
        id: 'brokerage',
        name: '증권 계좌',
        currentValue: 100000000,
        holdings: [
          { symbol: 'QQQM', name: 'Invesco NASDAQ 100', currentValueKRW: 70000000 },
          { symbol: 'SCHD', name: '배당 ETF', currentValueKRW: 10000000 },
          { symbol: 'IAU', name: '금 ETF', currentValueKRW: 15000000 },
          { symbol: 'TSLA', name: '테슬라', currentValueKRW: 5000000 },
        ],
      },
      { id: 'jeonse', name: '전세 보증금', currentValue: 200000000, holdings: [] },
    ],
  };
  const alignment = portfolioAlignment(portfolio);
  assert.equal(alignment.total, 100000000);
  assert.equal(alignment.driftAmount, 0);
  assert.equal(alignment.moves.length, 0);
  assert.deepEqual(
    alignment.buckets.slice(0, 4).map(bucket => Math.round(bucket.actualPct)),
    [70, 10, 15, 5]
  );
});

test('finance portfolio view reports aligned target policy', () => {
  const html = portfolioPolicyCard({
    rows: [{
      id: 'brokerage',
      name: '증권',
      currentValue: 100000000,
      holdings: [
        { symbol: 'QQQM', currentValueKRW: 70000000 },
        { symbol: 'SCHD', currentValueKRW: 10000000 },
        { symbol: 'IAU', currentValueKRW: 15000000 },
        { symbol: 'TSLA', currentValueKRW: 5000000 },
      ],
    }],
  });
  assert.match(html, /70\/10\/15\/5 포트폴리오 점검/);
  assert.match(html, /현재 비중은 목표 범위에 가깝습니다/);
});
