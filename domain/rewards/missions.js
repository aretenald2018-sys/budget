// ================================================================
// domain/rewards/missions.js — 미션 진행률 계산 (순수 함수)
// 설정 05 포인트/미션 화면. 미션 스키마는 data/repositories/settings.js
// normalizeMissionItem 참조. 흐름: flows/2026-07-24-settings-10-screens.md §2-05
// ================================================================

import { isBudgetExcluded, displayCategoryName } from '../transactions/budget.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, m - 1, d);
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

function inPeriod(tx, start, end) {
  const date = txDate(tx);
  return !!date && (!start || date >= start) && (!end || date <= endOfDay(end));
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// 반환: { pct, currentText, daysLeft, done, failed }
export function buildMissionProgress(mission = {}, txs = [], now = new Date()) {
  const start = parseISO(mission.period?.start);
  const end = parseISO(mission.period?.end);
  const daysLeft = end ? Math.max(0, Math.ceil((endOfDay(end) - now) / DAY_MS)) : null;
  const periodTxs = (Array.isArray(txs) ? txs : []).filter(tx => inPeriod(tx, start, end));
  const params = mission.params || {};

  if (mission.type === 'no_spend_days') {
    const target = Math.max(1, Number(params.targetDays) || 3);
    const spentDays = new Set();
    for (const tx of periodTxs) {
      if (!isExpense(tx)) continue;
      const date = txDate(tx);
      spentDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    }
    let noSpend = 0;
    if (start) {
      const last = end && endOfDay(end) < now ? endOfDay(end) : now;
      for (let t = new Date(start); t <= last; t = new Date(t.getTime() + DAY_MS)) {
        if (!spentDays.has(`${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`)) noSpend += 1;
      }
    }
    const count = Math.min(target, noSpend);
    return {
      pct: Math.round((count / target) * 100),
      currentText: `${count}/${target}`,
      daysLeft,
      done: count >= target,
      failed: false,
    };
  }

  if (mission.type === 'category_cap') {
    const cap = Math.max(0, Number(params.capAmount) || 0);
    const categoryName = String(params.categoryName || '');
    const spent = periodTxs
      .filter(tx => isExpense(tx) && displayCategoryName(tx) === categoryName)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const over = cap > 0 && spent > cap;
    const ended = end ? endOfDay(end) < now : false;
    return {
      pct: cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0,
      currentText: `${spent.toLocaleString('ko-KR')}원 / ${cap.toLocaleString('ko-KR')}원`,
      daysLeft,
      done: ended && !over,
      failed: over,
    };
  }

  if (mission.type === 'budget_pace') {
    const maxPct = Math.max(1, Number(params.maxPct) || 90);
    const budget = Math.max(0, Number(params.capAmount) || 0);
    const totalDays = start && end ? Math.max(1, Math.round((endOfDay(end) - start) / DAY_MS) + 1) : 7;
    const elapsedDays = start ? Math.max(1, Math.min(totalDays, Math.ceil((now - start) / DAY_MS))) : 1;
    const paceBudget = budget * (elapsedDays / totalDays);
    const spent = periodTxs.filter(isExpense).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const usagePct = paceBudget > 0 ? Math.round((spent / paceBudget) * 100) : 0;
    const over = paceBudget > 0 && usagePct > maxPct;
    const ended = end ? endOfDay(end) < now : false;
    return {
      pct: Math.round((elapsedDays / totalDays) * 100),
      currentText: `페이스 ${usagePct}% (기준 ${maxPct}%)`,
      daysLeft,
      done: ended && !over,
      failed: over,
    };
  }

  return { pct: 0, currentText: '', daysLeft, done: false, failed: false };
}

function isoDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// 신규 미션 자동 참여용 기본 미션 3종 (이번 주 기간). 난이도에 따라 강도 조절.
export function buildDefaultMissions(now = new Date(), { difficulty = 'normal', weeklyBudget = 0, topCategoryName = '' } = {}) {
  const hard = difficulty === 'high';
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const diff = (base.getDay() - 1 + 7) % 7; // 월요일 시작
  const start = new Date(base.getTime() - diff * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const period = { start: isoDate(start), end: isoDate(end) };
  const missions = [
    {
      id: `msn_nospend_${period.start}`,
      title: `주 ${hard ? 4 : 3}회 무지출 데이`,
      rewardPoints: hard ? 700 : 500,
      type: 'no_spend_days',
      params: { targetDays: hard ? 4 : 3 },
      period,
      active: true,
      completedAt: '',
    },
  ];
  if (topCategoryName) {
    missions.push({
      id: `msn_cap_${period.start}`,
      title: `${topCategoryName} 지출 줄이기`,
      rewardPoints: hard ? 400 : 300,
      type: 'category_cap',
      params: { categoryName: topCategoryName, capAmount: hard ? 20000 : 30000 },
      period,
      active: true,
      completedAt: '',
    });
  }
  if (weeklyBudget > 0) {
    missions.push({
      id: `msn_pace_${period.start}`,
      title: '예산 페이스 지키기',
      rewardPoints: hard ? 500 : 400,
      type: 'budget_pace',
      params: { maxPct: hard ? 80 : 90, capAmount: weeklyBudget },
      period,
      active: true,
      completedAt: '',
    });
  }
  return missions;
}
