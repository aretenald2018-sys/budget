import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPairingCode,
  DAYBIRD_DEFAULT_WEIGHTS,
  deviceAuthUid,
  normalizeDaybirdWeights,
  ownerUidFromPairingCode,
  pairingHash,
  signDashboardRequest,
} from '../api/_lib/daybird.js';

test('pairing codes retain the owner without storing the raw secret', () => {
  const code = createPairingCode('budget-owner');
  assert.equal(ownerUidFromPairingCode(code), 'budget-owner');
  assert.equal(pairingHash(code).length, 64);
  assert.notEqual(pairingHash(code), code);
});

test('device auth UID is stable and contains no raw device identifier', () => {
  const first = deviceAuthUid('device-12345678');
  assert.equal(first, deviceAuthUid('device-12345678'));
  assert.equal(first.includes('device-12345678'), false);
  assert.notEqual(first, deviceAuthUid('device-12345678', 'another-owner'));
});

test('dashboard weights must be integers totaling 100', () => {
  assert.deepEqual(normalizeDaybirdWeights(DAYBIRD_DEFAULT_WEIGHTS), DAYBIRD_DEFAULT_WEIGHTS);
  assert.throws(() => normalizeDaybirdWeights({ ...DAYBIRD_DEFAULT_WEIGHTS, wine: 11 }), /total 100/);
  assert.throws(() => normalizeDaybirdWeights({ ...DAYBIRD_DEFAULT_WEIGHTS, wine: 9.5 }), /invalid weight/);
});

test('internal refresh signature covers timestamp and exact body', () => {
  const signature = signDashboardRequest('{"a":1}', '100', 'secret');
  assert.equal(signature.length, 64);
  assert.notEqual(signature, signDashboardRequest('{"a":2}', '100', 'secret'));
});
