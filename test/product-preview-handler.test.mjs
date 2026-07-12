import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductPreviewHandler } from '../api/product-preview.js';

test('product preview handler can be tested without external network', async () => {
  const calls = [];
  const handler = createProductPreviewHandler({
    service: {
      async preview(url) {
        calls.push(url);
        return { ok: true, title: 'fixture product' };
      },
    },
  });
  const response = fakeResponse();

  await handler({ method: 'GET', query: { url: 'https://example.com/item' } }, response);

  assert.deepEqual(calls, ['https://example.com/item']);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, title: 'fixture product' });
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET, OPTIONS');
});

test('product preview handler keeps method and error response contracts', async () => {
  const handler = createProductPreviewHandler({
    service: { async preview() { throw new Error('fixture failure'); } },
  });
  const postResponse = fakeResponse();
  await handler({ method: 'POST', query: {} }, postResponse);
  assert.equal(postResponse.statusCode, 405);

  const errorResponse = fakeResponse();
  await handler({ method: 'GET', query: {} }, errorResponse);
  assert.equal(errorResponse.statusCode, 400);
  assert.deepEqual(errorResponse.body, { ok: false, error: 'fixture failure' });
});

function fakeResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
