import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNaverPayDuplicateMergePatch,
  isNaverPayTopupPurchasePair,
  parseNaverPayAutoPaymentMessage,
} from '../domain/transactions/naverpay.js';
import {
  CARD_SETTLEMENT_EXCLUDE_REASON,
  SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON,
  applyCardSettlementExclusion,
  applyTossKimTaewooSelfTransferExclusion,
  isCardSettlementTransfer,
  isTossKimTaewooSelfTransfer,
} from '../domain/transactions/self-transfer.js';
import {
  displayCategoryName,
  isBudgetExcluded,
  isReimbursementExpected,
} from '../domain/transactions/budget.js';
import {
  applySharedPaymentRule,
  markSharedPaymentSuggested,
  shouldSuggestSharedPayment,
} from '../domain/transactions/shared-payment.js';
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

test('card-company withdrawals are excluded without hiding ordinary card purchases', () => {
  for (const contract of contracts.cardSettlements) {
    assert.equal(isCardSettlementTransfer(contract.input), contract.matches);
    const actual = applyCardSettlementExclusion(contract.input);
    if (contract.matches) {
      assert.equal(actual.excludedFromBudget, true);
      assert.equal(actual.excludeFromBudget, true);
      assert.equal(actual.excludeReason, CARD_SETTLEMENT_EXCLUDE_REASON);
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

test('budget exclusion and reimbursement labels share one pure contract', () => {
  for (const contract of contracts.budgetRules) {
    assert.equal(isBudgetExcluded(contract.input), contract.excluded);
    assert.equal(isReimbursementExpected(contract.input), contract.reimbursement);
    assert.equal(displayCategoryName(contract.input), contract.displayCategory);
  }
});

test('shared payment suggestion and split calculations stay deterministic', () => {
  const contract = contracts.sharedPayments;
  assert.equal(shouldSuggestSharedPayment(contract.suggested), true);
  assert.equal(shouldSuggestSharedPayment(contract.notSuggested), false);
  assert.deepEqual(markSharedPaymentSuggested(contract.suggested), {
    ...contract.suggested,
    needsReview: true,
    needsSharedReview: true,
  });

  const applied = applySharedPaymentRule(
    contract.apply.input,
    contract.apply.peopleCount,
    contract.apply.ruleMeta,
    { appliedAt: contract.apply.appliedAt }
  );
  assert.equal(applied.amount, contract.apply.expectedAmount);
  assert.deepEqual(applied.sharedPayment, {
    status: 'applied',
    originalAmount: contract.apply.input.amount,
    peopleCount: contract.apply.peopleCount,
    myAmount: contract.apply.expectedAmount,
    appliedAt: contract.apply.appliedAt,
    ...contract.apply.ruleMeta,
  });
});
