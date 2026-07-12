import assert from 'node:assert/strict';
import test from 'node:test';

import {
  androidCaptureValidationError,
  parseAndroidCaptureBridgeJsonArray,
  transactionFromAndroidCapture,
} from '../utils/android-capture.js';
import { flushAndroidCaptureQueue } from '../utils/android-flush.js';

function capture(overrides = {}) {
  return {
    id: 'capture_1',
    schemaVersion: 1,
    type: 'card_payment',
    amount: 12000,
    merchant: '문정식당',
    occurredAt: '2026-07-12T12:30:00+09:00',
    capturedAt: Date.parse('2026-07-12T12:30:01+09:00'),
    source: 'android_local_notification',
    ...overrides,
  };
}

function options({ rows = [capture()], currentUser = { uid: 'user-1' }, existing = null, mergePatch = null, saveError = null } = {}) {
  const calls = [];
  return {
    calls,
    value: {
      bridge: {
        listPendingNotificationCaptures: () => {
          calls.push(['list']);
          return JSON.stringify(rows);
        },
        ackNotificationCapture: (...args) => calls.push(['ack', ...args]),
        failNotificationCapture: (...args) => calls.push(['fail', ...args]),
        recordCaptureInfo: (...args) => calls.push(['info', ...args]),
      },
      currentUser,
      scanRecentSmsCaptures: () => {
        calls.push(['scan']);
        return { permissionGranted: true, scanned: 1, queued: 0, ignored: 1, failed: 0 };
      },
      parseAndroidCaptureBridgeJsonArray,
      androidCaptureValidationError,
      transactionFromAndroidCapture,
      findSimilarTransaction: async () => existing,
      updateTransaction: async (...args) => calls.push(['update', ...args]),
      saveTransaction: async tx => {
        calls.push(['save', tx]);
        if (saveError) throw saveError;
        return 'tx-1';
      },
      buildNaverPayDuplicateMergePatch: () => mergePatch,
    },
  };
}

test('Android queue stays untouched before login and flushes immediately after login', async () => {
  const loggedOut = options({ currentUser: null });
  const skipped = await flushAndroidCaptureQueue(loggedOut.value);
  assert.equal(skipped.skipped, '로그인 필요');
  assert.deepEqual(loggedOut.calls, []);

  const loggedIn = options();
  const saved = await flushAndroidCaptureQueue(loggedIn.value);
  assert.equal(saved.saved, 1);
  assert.deepEqual(loggedIn.calls.slice(0, 2).map(call => call[0]), ['scan', 'list']);
  assert.ok(loggedIn.calls.some(call => call[0] === 'ack' && call[1] === 'capture_1' && call[2] === 'tx-1' && call[3] === 'saved'));
});

test('Android queue acks duplicates without creating a second transaction', async () => {
  const duplicate = options({ existing: { id: 'tx-existing' } });
  const result = await flushAndroidCaptureQueue(duplicate.value);
  assert.equal(result.duplicate, 1);
  assert.equal(duplicate.calls.some(call => call[0] === 'save'), false);
  assert.ok(duplicate.calls.some(call => call[0] === 'ack' && call[2] === 'tx-existing' && call[3] === 'duplicate'));
});

test('Android queue applies a duplicate merge patch before merged ack', async () => {
  const merged = options({ existing: { id: 'tx-existing' }, mergePatch: { paymentRail: 'naverpay' } });
  const result = await flushAndroidCaptureQueue(merged.value);
  assert.equal(result.duplicate, 1);
  assert.ok(merged.calls.some(call => call[0] === 'update' && call[1] === 'tx-existing' && call[2].paymentRail === 'naverpay'));
  assert.ok(merged.calls.some(call => call[0] === 'ack' && call[2] === 'tx-existing' && call[3] === 'merged'));
});

test('Android queue records invalid schema and save failures for retry', async () => {
  const invalid = options({ rows: [capture({ schemaVersion: 99 })] });
  const invalidResult = await flushAndroidCaptureQueue(invalid.value);
  assert.equal(invalidResult.failed, 1);
  assert.ok(invalid.calls.some(call => call[0] === 'fail' && /schemaVersion/.test(call[2])));

  const failed = options({ saveError: new Error('offline') });
  const failedResult = await flushAndroidCaptureQueue(failed.value);
  assert.equal(failedResult.failed, 1);
  assert.ok(failed.calls.some(call => call[0] === 'fail' && call[2] === 'offline'));
  assert.equal(failed.calls.some(call => call[0] === 'ack'), false);
});
