import assert from 'node:assert/strict';
import test from 'node:test';

import { firstEnv, requireEnv } from '../api/_lib/env.js';
import { defaultShouldRetry, fetchJsonWithTimeout, withRetry } from '../api/_lib/upstream.js';

test('server env policy supports aliases and typed missing errors', () => {
  const env = { PRIMARY: '', FALLBACK: 'value' };
  assert.equal(firstEnv(['PRIMARY', 'FALLBACK'], env), 'value');
  assert.equal(requireEnv(['PRIMARY', 'FALLBACK'], env), 'value');
  assert.throws(() => requireEnv('MISSING', env), err => err.code === 'ENV_MISSING' && err.statusCode === 500);
});

test('upstream JSON policy injects fetch and preserves response metadata', async () => {
  const calls = [];
  const result = await fetchJsonWithTimeout('https://example.com', { method: 'POST' }, {
    timeoutMs: 500,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, hasSignal: !!init.signal });
      return { ok: true, status: 200, async json() { return { ok: true }; } };
    },
  });
  assert.deepEqual(calls, [{ url: 'https://example.com', method: 'POST', hasSignal: true }]);
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.response.status, 200);
});

test('retry policy retries only transient failures', async () => {
  let attempts = 0;
  const value = await withRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('busy'), { status: 503 });
    return 'done';
  }, { attempts: 2 });
  assert.equal(value, 'done');
  assert.equal(attempts, 2);
  assert.equal(defaultShouldRetry(Object.assign(new Error('bad request'), { status: 400 })), false);
});
