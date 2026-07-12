import test from 'node:test';
import assert from 'node:assert/strict';

import {
  txReviewGuide,
  txReviewGuideHtml,
} from '../features/transactions/review-guide/index.js';

const dependencies = {
  displayCategoryName: tx => tx.category || '미분류',
  getAccountById: id => id === 'card' ? { alias: '생활카드' } : null,
  needsPaymentRailReview: tx => tx.paymentRail === 'naverpay',
};

test('transaction review guide prioritizes payment rail and missing category guidance', () => {
  assert.equal(txReviewGuide({ paymentRail: 'naverpay' }, dependencies).icon, 'N');
  assert.equal(txReviewGuide({ category: '' }, dependencies).icon, 'C');
  assert.equal(txReviewGuide({ category: '생활', type: 'transfer_in' }, dependencies).icon, '₩');
  assert.equal(txReviewGuide({ category: '생활', type: 'card_payment' }, dependencies).icon, '?');
});

test('transaction review guide limits the first viewport and escapes transaction text', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `tx-${index}`,
    merchant: index === 0 ? '<사용처>' : `사용처 ${index}`,
    category: '생활',
    type: 'card_payment',
    amount: 1000 + index,
    accountId: 'card',
    occurredAt: new Date(2026, 6, index + 1),
  }));
  const html = txReviewGuideHtml(items, '2026-07', dependencies);
  assert.match(html, /2026년 7월 검토 10건/);
  assert.match(html, /나머지 2건/);
  assert.match(html, /&lt;사용처&gt;/);
  assert.equal((html.match(/data-tx-review-action="open-detail"/g) || []).length, 8);
});
