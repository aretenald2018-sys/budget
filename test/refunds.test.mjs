import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findRefundTarget,
  isRefundMatch,
  isRefunded,
  planRefund,
} from '../domain/transactions/refunds.js';
import { isBudgetExcluded } from '../domain/transactions/budget.js';

const spend = (over = {}) => ({
  id: 'tx-1',
  type: 'card_payment',
  merchant: '무신사',
  amount: 89000,
  occurredAt: '2026-07-10T13:00:00+09:00',
  ...over,
});

const refund = (over = {}) => ({
  merchant: '무신사',
  amount: 89000,
  occurredAt: '2026-07-14T10:00:00+09:00',
  androidCaptureId: 'sms_cancel_1',
  ...over,
});

test('환불된 지출은 총지출에서 빠진다', () => {
  assert.equal(isBudgetExcluded(spend()), false);
  assert.equal(isBudgetExcluded(spend({ refundedAt: '2026-07-14T10:00:00+09:00' })), true);
  assert.equal(isRefunded(spend({ refundedAt: '2026-07-14T10:00:00+09:00' })), true);
});

test('가맹점·금액이 같고 기간 안이면 원 결제로 본다', () => {
  assert.equal(isRefundMatch(refund(), spend()), true);
  // 금액이 다르면 아니다
  assert.equal(isRefundMatch(refund({ amount: 50000 }), spend()), false);
  // 가맹점이 다르면 아니다
  assert.equal(isRefundMatch(refund({ merchant: '쿠팡' }), spend()), false);
  // 환불이 결제보다 앞설 수 없다
  assert.equal(isRefundMatch(refund({ occurredAt: '2026-07-01T10:00:00+09:00' }), spend()), false);
  // 이미 환불 처리된 건 다시 잡지 않는다
  assert.equal(isRefundMatch(refund(), spend({ refundedAt: '2026-07-12T00:00:00+09:00' })), false);
});

test('(주) 표기와 공백 차이는 같은 가맹점으로 본다', () => {
  assert.equal(isRefundMatch(refund({ merchant: '(주)무신사' }), spend({ merchant: '무신사' })), true);
  assert.equal(isRefundMatch(refund({ merchant: '무신사 ' }), spend({ merchant: '무신사' })), true);
});

test('후보가 여럿이면 가장 최근 결제를 고른다', () => {
  const older = spend({ id: 'old', occurredAt: '2026-07-01T13:00:00+09:00' });
  const newer = spend({ id: 'new', occurredAt: '2026-07-11T13:00:00+09:00' });
  assert.equal(findRefundTarget(refund(), [older, newer])?.id, 'new');
});

test('원 결제를 찾으면 취소선만 긋고 + 항목을 만들지 않는다', () => {
  const plan = planRefund(refund(), [spend()], { refundedAt: '2026-07-14T10:00:00+09:00' });
  assert.equal(plan.action, 'mark');
  assert.equal(plan.targetId, 'tx-1');
  assert.equal(plan.patch.refundedAt, '2026-07-14T10:00:00+09:00');
  assert.equal(plan.patch.refundAmount, 89000);
  // 수입(transfer_in)으로 만들지 않는다
  assert.equal(plan.patch.type, undefined);
});

test('원 결제를 못 찾으면 취소된 지출로 넣어 총액에 안 들어가게 한다', () => {
  const plan = planRefund(refund(), [], { refundedAt: '2026-07-14T10:00:00+09:00' });
  assert.equal(plan.action, 'orphan');
  assert.equal(plan.patch.type, 'card_payment');
  assert.equal(plan.patch.needsReview, true);
  assert.equal(isBudgetExcluded(plan.patch), true);
});
