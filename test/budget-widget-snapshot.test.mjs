import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetWidgetSnapshot } from '../utils/budget-widget-snapshot.js';

test('budget widget snapshot keeps spending, points, and latest wine note in one display-only payload', () => {
  const snapshot = buildBudgetWidgetSnapshot({
    now: new Date('2026-07-19T10:00:00+09:00'),
    transactions: [
      { type: 'card_payment', amount: 12000, occurredAt: '2026-07-18T10:00:00+09:00' },
      { type: 'transfer_out', amount: 30000, occurredAt: '2026-07-10T10:00:00+09:00' },
      { type: 'card_payment', amount: 90000, occurredAt: '2026-07-01T10:00:00+09:00', excludedFromBudget: true },
    ],
    categories: [{ kind: 'expense', target: 100000 }],
    rewardSummary: {
      pointBuckets: [
        { key: 'winePurchase', label: '와인구매 포인트', todayPoints: 4, monthPoints: 22 },
        { key: 'travelFund', label: '여행 포인트', todayPoints: 2, monthPoints: 8 },
      ],
    },
    bottles: [{ id: 'b1', name: 'Chianti', vintage: 2021 }],
    tastings: [{ bottleId: 'b1', tastedAt: '2026-07-18', taewooScore: 4.5, taewooSummary: '체리와 허브' }],
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.spending.monthSpent, 42000);
  assert.equal(snapshot.spending.monthTarget, 100000);
  assert.equal(snapshot.points.balance, 30);
  assert.equal(snapshot.points.todayPoints, 6);
  assert.equal(snapshot.wine.name, 'Chianti · 2021');
  assert.equal(snapshot.wine.note, '체리와 허브');
});
