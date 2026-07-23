import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fundAssignPanel,
  groupedCategoryOptions,
  normalizeSubcategories,
  sharedPaymentHtml,
  subcategoryEditorHtml,
  transactionEditorHtml,
} from '../features/transactions/editor/view.js';

const categories = [
  { id: 'food', name: '<식비>', kind: 'expense', parent: '생활', subcategories: ['식재료', { id: 'dining', name: '외식' }] },
  { id: 'salary', name: '급여', kind: 'income' },
];

test('transaction editor view keeps category groups and legacy subcategories safe', () => {
  assert.deepEqual(normalizeSubcategories(categories[0].subcategories), [
    { id: 'legacy_0', name: '식재료' },
    { id: 'dining', name: '외식' },
  ]);
  const options = groupedCategoryOptions(categories, '<식비>');
  assert.match(options, /optgroup label="생활"/);
  assert.match(options, /value="&lt;식비&gt;" selected/);
  const editor = subcategoryEditorHtml(categories, '<식비>', '외식');
  assert.match(editor, /data-id="dining" selected/);
  assert.match(editor, /data-subcategory-action="rename"/);
});

test('transaction editor renders delegated shared-payment and save controls', () => {
  const tx = {
    id: 'tx-1',
    type: 'card_payment',
    amount: 30000,
    category: '<식비>',
    subcategory: '외식',
    merchant: '<맛집>',
    needsReview: true,
    occurredAt: new Date(2026, 6, 12, 18, 30),
  };
  const html = transactionEditorHtml({
    tx,
    accounts: [{ id: 'card', alias: '생활카드', last4: '1234' }],
    categories,
    reimbursementExpected: true,
  });
  assert.match(html, /data-tx-editor-action="shared-payment"/);
  assert.match(html, /data-tx-editor-action="delete"/);
  assert.match(html, /name="confirmReview" checked/);
  assert.match(html, /tx-refund-panel active/);
  assert.match(html, /&lt;맛집&gt;/);
  assert.doesNotMatch(html, /onclick=/);
  assert.equal((sharedPaymentHtml(tx).match(/data-people-count=/g) || []).length, 3);
});

test('fund assign panel renders active funds and disables reimbursement when a fund is set', () => {
  const funds = [
    { id: 'f1', name: '돌발비용', emoji: '⚡', active: true },
    { id: 'f2', name: '보관중', emoji: '📦', active: false },
  ];
  const panel = fundAssignPanel({ id: 'tx-1', type: 'card_payment', fundId: 'f1' }, funds);
  assert.match(panel, /name="fundId"/);
  assert.match(panel, /data-fund-label="돌발비용"/);
  assert.match(panel, /value="f1"[^>]*selected/);
  assert.doesNotMatch(panel, /보관중/); // inactive fund hidden unless it is the current one
  assert.doesNotMatch(panel, /onclick=/);

  const html = transactionEditorHtml({
    tx: { id: 'tx-1', type: 'card_payment', amount: 200000, fundId: 'f1', occurredAt: new Date(2026, 6, 12) },
    accounts: [],
    categories,
    funds,
    reimbursementExpected: false,
  });
  // 충당금 선택 시 환급예정 체크박스는 비활성(상호배타, 펀드 우선)
  assert.match(html, /name="reimbursementExpected"[^>]*disabled/);
});

test('fund assign panel is empty for non-expense types', () => {
  assert.equal(fundAssignPanel({ id: 'tx-2', type: 'transfer_in' }, [{ id: 'f1', name: 'x', active: true }]), '');
});
