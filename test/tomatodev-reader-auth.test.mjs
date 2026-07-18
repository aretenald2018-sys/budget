import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchWithTomatoDevReaderAuth,
  getTomatoDevReaderIdToken,
} from '../api/_lib/tomatodev-reader-auth.js';
import { loadTomatoDevRawSource } from '../api/_lib/tomatodev-snapshot.js';

const projectId = 'tomatodev-arete';
const apiKey = 'public-test-api-key';
const email = 'daybird-reader@example.test';
const password = 'synthetic-test-password';

test('TomatoDev reader auth fails closed before network access when credentials are missing', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    getTomatoDevReaderIdToken({
      projectId,
      apiKey,
      env: {},
      tokenCache: new Map(),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('network must not be reached');
      },
    }),
    /TOMATODEV_READER_EMAIL\/TOMATODEV_READER_PASSWORD env missing/,
  );
  await assert.rejects(
    loadTomatoDevRawSource('김_태우', {
      env: {},
      todayKey: '2026-07-19',
      readerTokenCache: new Map(),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('network must not be reached');
      },
    }),
    /TOMATODEV_READER_EMAIL\/TOMATODEV_READER_PASSWORD env missing/,
  );
  assert.equal(fetchCalls, 0);
});

test('TomatoDev reader token is cached and renewed before expiry', async () => {
  const tokenCache = new Map();
  const firestoreHeaders = [];
  let signInCalls = 0;
  const fetchImpl = async (url, request = {}) => {
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      signInCalls += 1;
      const body = JSON.parse(request.body);
      assert.deepEqual(body, { email, password, returnSecureToken: true });
      return jsonResponse(200, { idToken: `reader-token-${signInCalls}`, expiresIn: '120' });
    }
    firestoreHeaders.push(request.headers.Authorization);
    return jsonResponse(200, { name: 'ok' });
  };
  const shared = { fetchImpl, tokenCache, projectId, apiKey, email, password };

  await fetchWithTomatoDevReaderAuth('https://firestore.googleapis.com/v1/first', {}, {
    ...shared,
    nowEpochMs: 0,
  });
  await fetchWithTomatoDevReaderAuth('https://firestore.googleapis.com/v1/second', {}, {
    ...shared,
    nowEpochMs: 30_000,
  });
  await fetchWithTomatoDevReaderAuth('https://firestore.googleapis.com/v1/third', {}, {
    ...shared,
    nowEpochMs: 60_001,
  });

  assert.equal(signInCalls, 2);
  assert.deepEqual(firestoreHeaders, [
    'Bearer reader-token-1',
    'Bearer reader-token-1',
    'Bearer reader-token-2',
  ]);
});

test('TomatoDev Firestore 401 forces one reader reauthentication and retry', async () => {
  const tokenCache = new Map();
  const firestoreHeaders = [];
  let signInCalls = 0;
  const fetchImpl = async (url, request = {}) => {
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      signInCalls += 1;
      return jsonResponse(200, { idToken: `retry-token-${signInCalls}`, expiresIn: '3600' });
    }
    firestoreHeaders.push(request.headers.Authorization);
    return firestoreHeaders.length === 1
      ? jsonResponse(401, { error: { code: 401 } })
      : jsonResponse(200, { name: 'authorized' });
  };

  const response = await fetchWithTomatoDevReaderAuth(
    'https://firestore.googleapis.com/v1/protected',
    { method: 'GET' },
    { fetchImpl, tokenCache, projectId, apiKey, email, password, nowEpochMs: 0 },
  );

  assert.equal(response.status, 200);
  assert.equal(signInCalls, 2);
  assert.deepEqual(firestoreHeaders, ['Bearer retry-token-1', 'Bearer retry-token-2']);
});

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}
