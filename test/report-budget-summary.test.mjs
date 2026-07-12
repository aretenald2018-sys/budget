import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expenseTransactions,
  paceText,
  progressPercentValue,
  reimbursementTransactions,
  targetFor,
  usedFor,
} from '../features/report/budget-summary/state.js';
import {
  budgetGaugeGroups,
  heroSecondaryProgress,
} from '../features/report/budget-summary/view.js';

test('report budget summary keeps cycle targets and exclusion rules stable', () => {
  const category = {
    name: '생활비용',
    parent: '생활유지비',
    emoji: '🧺',
    budgetRhythm: 'spread',
    monthlyTargets: { '2026-07': 400000 },
  };
  const byCategory = [{ name: '생활비용', expense: 120000 }];
  assert.equal(usedFor(category, byCategory), 120000);
  assert.equal(targetFor(category, '2026-07', 'cycle'), 200000);
  assert.equal(progressPercentValue(120000, 200000), 60);
  assert.equal(paceText(120000, 200000), '페이스 정상 · 예산의 60%');

  const transactions = [
    { id: 'expense', type: 'card_payment', amount: 120000 },
    { id: 'refund', type: 'card_payment', amount: 22400, reimbursementExpected: true },
    { id: 'self', type: 'transfer_out', amount: 50000, merchant: '토스 김태우' },
  ];
  assert.deepEqual(expenseTransactions(transactions).map(tx => tx.id), ['expense']);
  assert.deepEqual(reimbursementTransactions(transactions).map(tx => tx.id), ['refund']);
});

test('report budget views preserve home gauge and secondary progress contracts', () => {
  const category = { name: '생활비용', parent: '생활유지비', emoji: '🧺', target: 400000 };
  const html = budgetGaugeGroups([category], [{ name: '생활비용', expense: 120000 }], '2026-07', 'month', {
    showIcon: false,
    homeMode: true,
  });
  assert.match(html, /home-widget-gauge-row/);
  assert.match(html, /--fill-pct:30\.00%/);
  assert.match(heroSecondaryProgress('고정비', 100000, 200000), /50% 사용/);
});
