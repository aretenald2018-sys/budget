import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualSearchService } from '../api/services/visual-search.js';

test('visual search service normalizes input and uses a fake adapter', async () => {
  const calls = [];
  const service = createVisualSearchService({
    searchAdapter: {
      async search(query, limit) {
        calls.push({ query, limit });
        return { provider: 'fixture', items: [{ url: 'one' }, { url: 'two' }] };
      },
    },
  });
  const result = await service.search('  wine label  ', 1);
  assert.deepEqual(calls, [{ query: 'wine label', limit: 1 }]);
  assert.deepEqual(result, { ok: true, status: 200, provider: 'fixture', items: [{ url: 'one' }] });
});

test('visual search service preserves empty-query and provider-fallback contracts', async () => {
  const service = createVisualSearchService({
    searchAdapter: { async search() { throw new Error('fixture unavailable'); } },
  });
  assert.deepEqual(await service.search(''), { ok: false, status: 400, error: 'q 필요', items: [] });
  assert.deepEqual(await service.search('query'), {
    ok: true,
    status: 200,
    provider: 'none',
    warning: 'fixture unavailable',
    items: [],
  });
});
