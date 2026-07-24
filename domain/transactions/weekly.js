// ================================================================
// domain/transactions/weekly.js — 주간 리포트 집계 (순수 함수)
// 설정 06 주간 리포트 화면이 사용한다.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-06
// ================================================================

import { isBudgetExcluded, displayCategoryName } from './budget.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// 기준일이 속한 주의 범위. weekStartDay: 0(일)~6(토), 기본 월요일.
// offsetWeeks 로 이전/다음 주 이동.
export function weekRange(date = new Date(), { weekStartDay = 1, offsetWeeks = 0 } = {}) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const diff = (base.getDay() - weekStartDay + 7) % 7;
  const start = new Date(base.getTime() - diff * DAY_MS + offsetWeeks * 7 * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: rangeLabel(start, end) };
}

function rangeLabel(start, end) {
  return `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function txDate(tx) {
  const raw = tx?.occurredAt;
  if (!raw) return null;
  const date = raw.toDate ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpense(tx) {
  if (tx.type !== 'card_payment' && tx.type !== 'transfer_out') return false;
  return !isBudgetExcluded(tx);
}

function expenseTotal(txs) {
  return txs.filter(isExpense).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

function byCategoryMap(txs) {
  const map = {};
  for (const tx of txs) {
    if (!isExpense(tx)) continue;
    const name = displayCategoryName(tx);
    map[name] = (map[name] || 0) + (Number(tx.amount) || 0);
  }
  return map;
}

// 주간 리포트 모델. weeklyBudget: 이번 주 예산 분모(0이면 예산 대비 미표시).
export function buildWeeklyReport({ txs = [], prevTxs = [], weeklyBudget = 0, range } = {}) {
  const total = expenseTotal(txs);
  const prevTotal = expenseTotal(prevTxs);
  const delta = total - prevTotal;
  const deltaPct = prevTotal > 0 ? Math.round((delta / prevTotal) * 1000) / 10 : null;

  // 무지출 일수: 범위 내 지출 0원인 날 수 (오늘까지 경과일 기준)
  const spentByDay = {};
  for (const tx of txs) {
    if (!isExpense(tx)) continue;
    const date = txDate(tx);
    if (!date) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    spentByDay[key] = (spentByDay[key] || 0) + (Number(tx.amount) || 0);
  }
  let noSpendDays = 0;
  if (range?.start) {
    const now = new Date();
    const last = range.end && range.end < now ? range.end : now;
    for (let t = new Date(range.start); t <= last; t = new Date(t.getTime() + DAY_MS)) {
      const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
      if (!spentByDay[key]) noSpendDays += 1;
    }
  }

  // 카테고리 분석 (비중 내림차순)
  const catMap = byCategoryMap(txs);
  const byCategory = Object.entries(catMap)
    .map(([name, amount]) => ({ name, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // 주간 하이라이트: 전주 대비 증감 최대/최소 카테고리 + 반복 지출(동일 상호 2회 이상)
  const prevCatMap = byCategoryMap(prevTxs);
  const names = new Set([...Object.keys(catMap), ...Object.keys(prevCatMap)]);
  let topIncrease = null;
  let topDecrease = null;
  for (const name of names) {
    const d = (catMap[name] || 0) - (prevCatMap[name] || 0);
    if (d > 0 && (!topIncrease || d > topIncrease.delta)) topIncrease = { name, delta: d };
    if (d < 0 && (!topDecrease || d < topDecrease.delta)) topDecrease = { name, delta: d };
  }
  const merchantCounts = {};
  for (const tx of txs) {
    if (!isExpense(tx)) continue;
    const merchant = String(tx.merchant || tx.counterparty || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!merchant) continue;
    merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
  }
  const recurringCount = Object.values(merchantCounts).filter(count => count >= 2).length;

  return {
    total,
    prevTotal,
    delta,
    deltaPct,
    budget: weeklyBudget,
    budgetProgress: weeklyBudget > 0 ? Math.min(999, Math.round((total / weeklyBudget) * 100)) : null,
    noSpendDays,
    byCategory,
    highlights: { topIncrease, topDecrease, recurringCount },
  };
}

// 주 예산 분모: cycle==='weekly'면 전체 예산 그대로,
// 그 외에는 월 예산을 해당 주 일수/해당 월 일수로 안분한다.
export function weeklyBudgetFor({ budgetAmount = 0, cycle = 'monthly', range } = {}) {
  const amount = Math.max(0, Number(budgetAmount) || 0);
  if (!amount) return 0;
  if (cycle === 'weekly') return amount;
  if (!range?.start) return Math.round(amount * 7 / 30);
  const daysInMonth = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate();
  return Math.round(amount * 7 / daysInMonth);
}
