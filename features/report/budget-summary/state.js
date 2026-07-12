import {
  isBudgetExcluded,
  isReimbursementExpected,
} from '../../../domain/transactions/budget.js';

export function usedFor(category, byCategory) {
  return Number(byCategory.find(row => row.name === category.name)?.expense || 0);
}

export function targetFor(category, monthKey, mode) {
  const monthly = Number(category.monthlyTargets?.[monthKey] ?? category.target ?? 0) || 0;
  if (mode !== 'cycle') return monthly;
  return currentRhythm(category) === 'front_loaded' ? monthly : Math.round(monthly / 2);
}

export function currentRhythm(category) {
  return category.budgetRhythm || 'spread';
}

export function isControlCategory(category) {
  return currentRhythm(category) !== 'fixed';
}

export function expenseTransactions(transactions = []) {
  return transactions
    .filter(tx => tx.type === 'card_payment' || tx.type === 'transfer_out')
    .filter(tx => tx.type !== 'internal_transfer')
    .filter(tx => !isBudgetExcluded(tx));
}

export function reimbursementTransactions(transactions = []) {
  return transactions
    .filter(tx => tx.type === 'card_payment' || tx.type === 'transfer_out')
    .filter(tx => isReimbursementExpected(tx));
}

export function ratio(used, target) {
  if (!target) return 0;
  return Math.min(1, Math.max(0, used / target));
}

export function progressPercentValue(used, target) {
  const numericTarget = Number(target) || 0;
  if (numericTarget <= 0) return 0;
  const numericUsed = Math.max(0, Number(used) || 0);
  return Math.min(100, Math.max(0, (numericUsed / numericTarget) * 100));
}

export function paceText(used, target) {
  if (!target) return '목표 미설정';
  const pct = Math.round((used / target) * 100);
  if (pct >= 100) return `초과 주의 · 예산의 ${pct}%`;
  if (pct >= 85) return `속도 빠름 · 예산의 ${pct}%`;
  return `페이스 정상 · 예산의 ${pct}%`;
}
