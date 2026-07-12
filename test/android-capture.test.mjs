import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANDROID_CAPTURE_SCHEMA_VERSION,
  androidCaptureValidationError,
  parseAndroidCaptureBridgeJsonArray,
  transactionFromAndroidCapture,
} from '../utils/android-capture.js';
import { loadFixture } from './helpers/fixtures.mjs';

const cases = await loadFixture('android-captures.json', import.meta.url);
const contracts = await loadFixture('android-contracts.json', import.meta.url);

test('Android capture schema version matches the shared contract', () => {
  assert.equal(ANDROID_CAPTURE_SCHEMA_VERSION, contracts.capture.schemaVersion);
  assert.equal(androidCaptureValidationError(cases[0].input), '');
  assert.match(androidCaptureValidationError({ ...cases[0].input, schemaVersion: 99 }), /지원하지 않는 capture schemaVersion/);
  assert.match(androidCaptureValidationError({ ...cases[0].input, source: 'server_ingest' }), /지원하지 않는 capture source/);
});

for (const contract of cases) {
  test(`Android capture contract: ${contract.name}`, () => {
    const actual = transactionFromAndroidCapture(contract.input);
    if (contract.expected === null) {
      assert.equal(actual, null);
      return;
    }
    assert.ok(actual);
    for (const [key, value] of Object.entries(contract.expected)) {
      assert.deepEqual(actual[key], value, key);
    }
    assert.equal(actual.androidCaptureId, contract.input.id);
    assert.equal(actual.occurredAt.getTime(), new Date(contract.input.occurredAt).getTime());
  });
}

test('Android bridge JSON parser only accepts arrays', () => {
  assert.equal(parseAndroidCaptureBridgeJsonArray(JSON.stringify(cases.map(item => item.input))).length, cases.length);
  assert.deepEqual(parseAndroidCaptureBridgeJsonArray('{"id":"not-an-array"}'), []);
  assert.deepEqual(parseAndroidCaptureBridgeJsonArray('{'), []);
});
