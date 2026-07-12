import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isUnassignedSubcategory,
  normalizeSubcategoryOptions,
  subcategoryOptionsForCategory,
  UNASSIGNED_SUBCATEGORY_LABEL,
} from '../features/report/subcategory-classifier/state.js';
import { subcategoryClassifierHtml } from '../features/report/subcategory-classifier/view.js';

test('subcategory classifier state preserves legacy options and adds missing transport defaults', () => {
  const category = {
    name: '교통비용',
    subcategories: ['대중교통', { id: 'custom', name: '주차' }],
  };
  assert.deepEqual(normalizeSubcategoryOptions(category.subcategories), [
    { id: 'legacy_0', name: '대중교통' },
    { id: 'custom', name: '주차' },
  ]);
  assert.deepEqual(
    subcategoryOptionsForCategory(category).map(item => item.name),
    ['대중교통', '주차', '택시', '교통카드충전', '기타교통']
  );
  assert.equal(isUnassignedSubcategory(''), true);
  assert.equal(isUnassignedSubcategory(UNASSIGNED_SUBCATEGORY_LABEL), true);
  assert.equal(isUnassignedSubcategory('택시'), false);
});

test('subcategory classifier view keeps delegated action controls', () => {
  const html = subcategoryClassifierHtml([
    { id: 'tx-1', type: 'card_payment', merchant: '교통카드', amount: 10000, occurredAt: '2026-07-12T00:00:00.000Z' },
  ], [{ id: 'taxi', name: '택시' }], 'cycle');
  assert.match(html, /data-report-action="toggle-subcategory-all"/);
  assert.match(html, /data-report-action="save-subcategory-classifier"/);
  assert.doesNotMatch(html, /onclick=/);
});
