import assert from 'node:assert/strict';
import test from 'node:test';

import { __receiptEnricherTestHooks as hooks } from '../api/_lib/receipt-enricher.js';
import {
  buildReceiptMemo,
  classifyReceiptCategory,
  mergeReceiptMemo,
} from '../domain/receipts/rules.js';
import { loadFixture } from './helpers/fixtures.mjs';

const contract = await loadFixture('receipt-contract.json', import.meta.url);

test('Gmail receipt memo merge preserves the Android capture memo and is idempotent', () => {
  const receiptMemo = hooks.buildReceiptMemo(contract.receipt, contract.receipt);
  assert.match(receiptMemo, /\[쿠팡 영수증\]/);
  assert.match(receiptMemo, /햇반 x2 14,000원/);
  const merged = hooks.mergeReceiptMemo(contract.existingMemo, receiptMemo);
  assert.match(merged, /Android 문자 자동 수집/);
  assert.match(merged, /물티슈 127,000원/);
  assert.equal(hooks.mergeReceiptMemo(merged, receiptMemo), merged);
});

test('Gmail receipt item classification enriches the Android transaction without changing its source', () => {
  const patch = hooks.transactionCategoryPatch(contract.receipt, contract.receipt, {
    memo: contract.existingMemo,
    confidence: 0.5,
    source: 'android_local_sms',
  });
  assert.equal(patch.category, contract.expected.category);
  assert.equal(patch.subcategory, contract.expected.subcategory);
  assert.equal(patch.autoCategorySource, contract.expected.autoCategorySource);
  assert.equal(patch.source, undefined);
  assert.equal(patch.needsReview, false);
});

test('receipt links preserve legacy receiptId and avoid duplicate array entries', () => {
  assert.deepEqual(
    hooks.receiptLinkIds('receipt_new', { receiptId: 'receipt_legacy' }),
    { arrayUnionIds: ['receipt_legacy', 'receipt_new'], receiptId: '' },
  );
  assert.deepEqual(
    hooks.receiptLinkIds('receipt_new', { receiptId: 'receipt_legacy', receiptIds: ['receipt_legacy', 'receipt_new'] }),
    { arrayUnionIds: [], receiptId: '' },
  );
});

test('browser and server receipt paths share the pure classification and memo rules', () => {
  assert.deepEqual(classifyReceiptCategory(contract.receipt), {
    category: contract.expected.category,
    subcategory: contract.expected.subcategory,
    confidence: 0.86,
    source: contract.expected.autoCategorySource,
  });
  const memo = buildReceiptMemo(contract.receipt);
  assert.equal(memo, hooks.buildReceiptMemo(contract.receipt, contract.receipt));

  const staleMemo = '[쿠팡 영수증]\n- 이전 품목 1,000원';
  assert.equal(mergeReceiptMemo(staleMemo, memo, { replaceExistingSection: false }), staleMemo);
  assert.equal(mergeReceiptMemo(staleMemo, memo), memo);
});
