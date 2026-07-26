// ================================================================
// features/home/cards.js — 설정 07 추가 홈 카드 모델
// (최근 거래 · 예산 요약 · 소비 캘린더). 순수 함수(입력 → 모델).
// ================================================================

import { displayCategoryName } from '../../data.js';
import { isBudgetExcluded } from '../../domain/transactions/budget.js';
import { fmtKRW, fmtMonthLabel } from '../../utils/format.js';

export function buildRecentTxCard(monthTxs) {
  const items = (monthTxs || [])
    .filter(tx => tx.type !== 'internal_transfer')
    .slice(0, 5)
    .map(tx => {
      const date = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
      const income = tx.type === 'transfer_in' || tx.type === 'settlement_in';
      const amount = Math.round(Number(tx.amount) || 0);
      return {
        label: tx.merchant || tx.counterparty || displayCategoryName(tx),
        dateText: Number.isNaN(date?.getTime?.()) ? '' : `${date.getMonth() + 1}/${date.getDate()}`,
        amountText: `${income ? '+' : '−'}${Math.abs(amount).toLocaleString('ko-KR')}원`,
        income,
      };
    });
  return { items };
}

export function buildBudgetSummaryCard(appSettings, { used = 0, target = 0, periodLabel = '' } = {}) {
  const budget = appSettings.budget?.amount || target;
  if (!budget) return null;
  return {
    periodLabel,
    spentText: fmtKRW(used),
    budgetText: fmtKRW(budget),
    percent: Math.round((used / budget) * 100),
  };
}

export function buildCalendarCard(monthTxs, monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  const totals = new Array(daysInMonth + 1).fill(0);
  for (const tx of monthTxs || []) {
    if (tx.type !== 'card_payment' && tx.type !== 'transfer_out') continue;
    if (isBudgetExcluded(tx)) continue;
    const date = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
    if (Number.isNaN(date?.getTime?.()) || date.getMonth() + 1 !== month) continue;
    totals[date.getDate()] += Number(tx.amount) || 0;
  }
  return {
    monthLabel: fmtMonthLabel(monthKey),
    days: Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: totals[i + 1] })),
  };
}

