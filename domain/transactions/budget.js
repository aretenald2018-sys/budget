import { isNaverPayTopup } from './naverpay.js';
import { isCardSettlementTransfer, isTossKimTaewooSelfTransfer } from './self-transfer.js';

export const DEFAULT_REIMBURSEMENT_CATEGORY_NAME = '환급예정금액';
export const DEFAULT_UNCATEGORIZED_CATEGORY_NAME = '미분류';

export function isReimbursementExpected(tx = {}) {
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
