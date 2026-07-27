import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bottleDraftFromTx,
  buildWineCellarSummary,
  isWinePurchaseTx,
  unlinkedWinePurchases,
} from '../domain/wine/purchases.js';

const getCategoryName = tx => tx.category || '';

const txs = [
  { id: 't1', type: 'card_payment', amount: 38000, category: '와인/야식', merchant: '와인앤모어', occurredAt: '2026-07-17T20:00:00+09:00' },
  { id: 't2', type: 'card_payment', amount: 21000, category: '미분류', merchant: '바틀샵', occurredAt: '2026-07-24T19:00:00+09:00' },
  { id: 't3', type: 'card_payment', amount: 4800, category: '카페비용', merchant: '스타벅스', occurredAt: '2026-07-16T09:00:00+09:00' },
  { id: 't4', type: 'transfer_in', amount: 900000, category: '월급', merchant: '회사', occurredAt: '2026-07-14T09:00:00+09:00' },
];

test('와인 결제는 카테고리 또는 가맹점 키워드로 판별한다', () => {
  assert.equal(isWinePurchaseTx(txs[0], getCategoryName), true);  // 카테고리 '와인/야식'
  assert.equal(isWinePurchaseTx(txs[1], getCategoryName), true);  // 가맹점 '바틀샵'
  assert.equal(isWinePurchaseTx(txs[2], getCategoryName), false);
  assert.equal(isWinePurchaseTx(txs[3], getCategoryName), false); // 수입은 제외
});

test('셀러에 연결된 결제는 등록 대기 목록에서 빠지고 최신순으로 정렬된다', () => {
  const none = unlinkedWinePurchases(txs, [], getCategoryName);
  assert.deepEqual(none.map(tx => tx.id), ['t2', 't1']);
  const linked = unlinkedWinePurchases(txs, [{ id: 'b1', purchaseTxId: 't1' }], getCategoryName);
  assert.deepEqual(linked.map(tx => tx.id), ['t2']);
});

test('셀러 요약은 와인 지출과 와인구매 포인트를 함께 집계한다', () => {
  const summary = buildWineCellarSummary({
    transactions: txs,
    bottles: [{ id: 'b1', purchaseTxId: 't1', pricePaid: 38000 }],
    tastings: [{ id: 'n1' }],
    pointBuckets: [{ key: 'winePurchase', label: '와인구매 포인트', monthPoints: 27792, earnedMonthPoints: 30000, spentMonthPoints: 2208, targetAmount: 120000 }],
    getCategoryName,
  });
  assert.equal(summary.spent, 59000);
  assert.equal(summary.purchaseCount, 2);
  assert.equal(summary.linkedSpend, 38000);
  assert.equal(summary.unlinkedCount, 1);
  assert.equal(summary.points.balance, 27792);
  assert.equal(summary.points.target, 120000);
});

test('결제 한 건에서 와인 등록 초안을 만든다', () => {
  const draft = bottleDraftFromTx(txs[1]);
  assert.equal(draft.name, '바틀샵');
  assert.equal(draft.pricePaid, 21000);
  assert.equal(draft.purchaseTxId, 't2');
  assert.ok(draft.purchasedAt instanceof Date);
});
