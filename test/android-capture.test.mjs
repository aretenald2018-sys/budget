import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAndroidCaptureBridgeJsonArray,
  transactionFromAndroidCapture,
} from '../utils/android-capture.js';
import { loadFixture } from './helpers/fixtures.mjs';

const cases = await loadFixture('android-captures.json', import.meta.url);

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
