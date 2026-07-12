import assert from 'node:assert/strict';
import test from 'node:test';

import { syncTelegramPublicFeed } from '../api/_lib/telegram-public-feed.js';

test('telegram sync accepts a fake state adapter without Firestore', async () => {
  const calls = [];
  const stateAdapter = {
    async load() { calls.push('load'); return { sources: {} }; },
    async persist(results, context) {
      calls.push({ type: 'persist', results: results.length, now: context.now.toISOString() });
    },
  };
  const now = new Date('2026-07-12T00:00:00Z');

  const result = await syncTelegramPublicFeed({
    sources: [],
    stateAdapter,
    now,
    logger: { log() {} },
  });

  assert.equal(result.ok, true);
  assert.equal(result.selectedSources, 0);
  assert.deepEqual(calls, ['load', { type: 'persist', results: 0, now: now.toISOString() }]);
});
