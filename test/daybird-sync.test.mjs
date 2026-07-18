import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { createTrailingRefreshDrain } from '../utils/trailing-refresh.js';

test('a mutation queued during an in-flight refresh gets a trailing refresh', async () => {
  let marker = { id: 'first', reason: 'transaction-update' };
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const sent = [];
  const drain = createTrailingRefreshDrain({
    readPending: () => marker,
    clearPendingIfCurrent: id => {
      if (marker?.id !== id) return false;
      marker = null;
      return true;
    },
    send: async reason => {
      sent.push(reason);
      if (sent.length === 1) await firstGate;
      return true;
    },
  });

  const first = drain.flush();
  await Promise.resolve();
  marker = { id: 'second', reason: 'category-delete' };
  const second = drain.flush();
  releaseFirst();

  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(sent, ['transaction-update', 'category-delete']);
  assert.equal(marker, null);
});

test('a failed refresh preserves its pending marker for a later retry', async () => {
  let marker = { id: 'retry', reason: 'receipt-apply' };
  const drain = createTrailingRefreshDrain({
    readPending: () => marker,
    clearPendingIfCurrent: id => {
      if (marker?.id !== id) return false;
      marker = null;
      return true;
    },
    send: async () => { throw new Error('offline'); },
  });

  await assert.rejects(drain.flush(), /offline/);
  assert.deepEqual(marker, { id: 'retry', reason: 'receipt-apply' });
});

test('dashboard-relevant composite mutations queue a refresh after completion', async () => {
  const [categories, transactions] = await Promise.all([
    fs.readFile(new URL('../data/repositories/master-data.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../data/repositories/transactions.js', import.meta.url), 'utf8'),
  ]);

  assert.match(categories, /deleteCategory[\s\S]*await loadCategories\(\);[\s\S]*queueDaybirdRefresh\('category-delete'\)/);
  assert.match(transactions, /applySharedPayment[\s\S]*await hideSharedPaymentDuplicateTransactions[\s\S]*queueDaybirdRefresh\('shared-payment-apply'\)/);
  assert.match(transactions, /applyReceiptToTransaction[\s\S]*await Promise\.all[\s\S]*queueDaybirdRefresh\('receipt-apply'\)/);
});
