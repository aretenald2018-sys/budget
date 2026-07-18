import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearBudgetWebLaunchEntry,
  createBudgetLaunchEntryQueue,
  installBudgetNativeEntryReceiver,
  normalizeBudgetLaunchEntry,
  readBudgetWebLaunchEntry,
} from '../utils/launch-entry.js';

test('launch entry normalization only accepts supported Budget surfaces', () => {
  assert.equal(normalizeBudgetLaunchEntry('spending'), 'spending');
  assert.equal(normalizeBudgetLaunchEntry(' wine '), 'wine');
  assert.equal(normalizeBudgetLaunchEntry('finance'), '');
  assert.equal(normalizeBudgetLaunchEntry(null), '');
});

test('cold-launch entries stay queued until the authenticated app is ready', () => {
  let ready = false;
  const delivered = [];
  const queue = createBudgetLaunchEntryQueue({
    isReady: () => ready,
    onEntry: (entry, source) => delivered.push([entry, source]),
  });

  assert.equal(queue.enqueue('spending', 'android-intent'), true);
  assert.equal(queue.enqueue('wine', 'android-intent'), true);
  assert.equal(queue.enqueue('unknown', 'android-intent'), false);
  assert.equal(queue.pendingCount(), 2);
  assert.deepEqual(delivered, []);

  ready = true;
  assert.equal(queue.flush(), 2);
  assert.equal(queue.pendingCount(), 0);
  assert.deepEqual(delivered, [
    ['spending', 'android-intent'],
    ['wine', 'android-intent'],
  ]);
});

test('warm-launch entries dispatch immediately without a page reload', () => {
  const delivered = [];
  const queue = createBudgetLaunchEntryQueue({
    isReady: () => true,
    onEntry: (entry, source) => delivered.push([entry, source]),
  });

  assert.equal(queue.enqueue('spending', 'android-intent'), true);
  assert.equal(queue.pendingCount(), 0);
  assert.deepEqual(delivered, [['spending', 'android-intent']]);
});

test('web query fallback keeps other URL state when its entry is consumed', () => {
  const replaced = [];
  const location = { href: 'https://example.test/budget/?entry=spending&debug=1#summary' };
  const history = { replaceState: (...args) => replaced.push(args) };

  assert.equal(readBudgetWebLaunchEntry('?entry=spending&debug=1'), 'spending');
  clearBudgetWebLaunchEntry(location, history, 'Budget');
  assert.deepEqual(replaced, [[{}, 'Budget', '/budget/?debug=1#summary']]);
});

test('native receiver drains page-finish entries and accepts later warm entries', () => {
  const originalWindow = globalThis.window;
  const delivered = [];
  const queue = createBudgetLaunchEntryQueue({
    isReady: () => true,
    onEntry: (entry, source) => delivered.push([entry, source]),
  });

  try {
    globalThis.window = { __budgetNativeEntries: ['spending'] };
    installBudgetNativeEntryReceiver(queue);
    assert.deepEqual(delivered, [['spending', 'android-intent']]);
    assert.deepEqual(globalThis.window.__budgetNativeEntries, []);

    assert.equal(globalThis.window.receiveBudgetNativeEntry('wine'), true);
    assert.deepEqual(delivered.at(-1), ['wine', 'android-intent']);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
