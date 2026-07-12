import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNaverPayDuplicateMergePatch,
  isNaverPayTopupPurchasePair,
  parseNaverPayAutoPaymentMessage,
} from '../utils/naverpay.js';
import {
  SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON,
  applyTossKimTaewooSelfTransferExclusion,
  isTossKimTaewooSelfTransfer,
} from '../utils/self-transfer.js';
import { loadFixture } from './helpers/fixtures.mjs';

const contracts = await loadFixture('transaction-rules.json', import.meta.url);

test('self-transfer detection and exclusion stay compatible', () => {
  for (const contract of contracts.selfTransfers) {
    assert.equal(isTossKimTaewooSelfTransfer(contract.input), contract.matches);
    const actual = applyTossKimTaewooSelfTransferExclusion(contract.input);
    if (contract.matches) {
      assert.equal(actual.excludedFromBudget, true);
      assert.equal(actual.excludeFromBudget, true);
      assert.equal(actual.excludeReason, SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON);
    } else {
      assert.equal(actual, contract.input);
    }
  }
});

test('NaverPay completed-payment message parsing stays compatible', () => {
  const contract = contracts.naverPayMessage;
  const actual = parseNaverPayAutoPaymentMessage(contract);
  assert.ok(actual);
  for (const [key, value] of Object.entries(contract.expected)) {
    assert.deepEqual(actual[key], value, key);
  }
});

test('NaverPay top-up and purchase merge stays idempotent at the transaction boundary', () => {
  const contract = contracts.naverPayMerge;
  assert.equal(isNaverPayTopupPurchasePair(contract.existing, contract.incoming), true);
  const actual = buildNaverPayDuplicateMergePatch(contract.existing, contract.incoming);
  assert.deepEqual(actual, contract.expected);
  assert.equal(buildNaverPayDuplicateMergePatch(contract.incoming, contract.existing), null);
});
