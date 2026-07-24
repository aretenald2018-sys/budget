import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTransactionRows, buildBudgetRows, buildCsv, buildExcelHtml } from '../domain/transactions/export.js';
import { allocateBudget } from '../domain/transactions/allocate.js';

test('buildTransactionRows honors option toggles', () => {
  const txs = [
    { type: 'card_payment', occurredAt: new Date(2026, 6, 20, 9, 30), amount: 5000, category: '카페비용', merchant: '스타벅스', memo: '아아', accountName: '체크카드' },
    { type: 'card_payment', occurredAt: new Date(2026, 6, 21), amount: 3000, category: '간식', canceled: true },
  ];
  const full = buildTransactionRows(txs, { includeMemo: true, includePayment: true, includeCanceled: false });
  assert.equal(full.rows.length, 1); // 취소 거래 제외
  assert.deepEqual(full.header, ['일시', '구분', '카테고리', '거래처', '금액(원)', '결제 수단', '메모', '예산 제외']);
  assert.equal(full.rows[0][3], '스타벅스');
  const lean = buildTransactionRows(txs, { includeMemo: false, includePayment: false, includeCanceled: true });
  assert.equal(lean.rows.length, 2);
  assert.deepEqual(lean.header, ['일시', '구분', '카테고리', '거래처', '금액(원)', '예산 제외']);
});

test('buildCsv joins sections with BOM and escapes commas/quotes', () => {
  const csv = buildCsv([
    { title: '거래 내역', table: { header: ['a', 'b'], rows: [['1,2', 'x"y']] } },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"1,2","x""y"'));
  assert.ok(csv.includes('[거래 내역]'));
});

test('buildBudgetRows and buildExcelHtml include totals and escape markup', () => {
  const { rows } = buildBudgetRows([
    { kind: 'expense', name: '카페', monthlyTargets: { '2026-07': 50000 } },
    { kind: 'income', name: '월급' },
  ], '2026-07', 750000);
  assert.deepEqual(rows[0], ['전체 예산', '750000']);
  assert.deepEqual(rows[1], ['카페', '50000']);
  const html = buildExcelHtml([{ title: 't', table: { header: ['<b>'], rows: [['&']] } }]);
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('allocateBudget distributes by weight in 1,000-won units and preserves the total', () => {
  const result = allocateBudget(100000, [
    { id: 'a', weight: 2 },
    { id: 'b', weight: 1 },
    { id: 'c', weight: 1 },
  ]);
  assert.equal(result.a + result.b + result.c, 100000);
  assert.ok(result.a >= result.b);
  assert.equal(result.b % 1000, 0);
  // 가중치 없으면 균등 분배
  const even = allocateBudget(90000, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.equal(even.a + even.b + even.c, 90000);
});
