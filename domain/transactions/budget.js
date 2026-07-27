import { isNaverPayTopup } from './naverpay.js';
import { isRefunded } from './refunds.js';
import { isCardSettlementTransfer, isTossKimTaewooSelfTransfer } from './self-transfer.js';

export const DEFAULT_REIMBURSEMENT_CATEGORY_NAME = '환급예정금액';
export const DEFAULT_UNCATEGORIZED_CATEGORY_NAME = '미분류';

export function isFundCovered(tx = {}) {
  return !!(tx.excludeReason === 'fund_covered' || tx.fundId);
}

export function isReimbursementExpected(tx = {}) {
  if (isFundCovered(tx)) return false;
  return !!(
    tx.reimbursementExpected
    || tx.excludeReason === 'reimbursement_expected'
    || (tx.excludedFromBudget && !tx.excludeReason)
  );
}

export function isBudgetExcluded(tx = {}) {
  return !!(
    tx.excludedFromBudget
    || tx.excludeFromBudget
    // 환불된 지출은 실제로 나가지 않은 돈이다 — 총지출에서 빼고 목록에선 취소선으로 남긴다.
    || isRefunded(tx)
    || isFundCovered(tx)
    || isReimbursementExpected(tx)
    || isTossKimTaewooSelfTransfer(tx)
    || isCardSettlementTransfer(tx)
  );
}

export function needsPaymentRailReview(tx = {}) {
  return isNaverPayTopup(tx) && tx.paymentRailResolved !== true;
}

export function displayCategoryName(tx = {}, options = {}) {
  const reimbursementCategoryName = options.reimbursementCategoryName || DEFAULT_REIMBURSEMENT_CATEGORY_NAME;
  const uncategorizedCategoryName = options.uncategorizedCategoryName || DEFAULT_UNCATEGORIZED_CATEGORY_NAME;
  if (isReimbursementExpected(tx)) return reimbursementCategoryName;
  return tx.category || uncategorizedCategoryName;
}
