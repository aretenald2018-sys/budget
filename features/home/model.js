// ================================================================
// features/home/model.js — 홈 대시보드 데이터 모델 빌더
// renderReport(homeMode)가 로드한 데이터로 dashboard.js가 쓸 모델을 만든다.
// 순수 함수(입력 → 모델). 데이터 접근·Firestore 없음.
// ================================================================

import { effectiveTargetFor, targetFor, usedFor } from '../report/budget-summary/state.js';
import { fmtKRW } from '../../utils/format.js';

const CATEGORY_ORDER = ['생활유지비', '자아유지비', '변동비', '미분류'];
const GOAL_ICON_KEYS = {
  생활유지비: 'home',
  자아유지비: 'leaf',
  변동비: 'glass',
  미분류: 'question',
};

export function buildHomeModel(ctx = {}) {
  const {
    user = {}, cycleRange = {}, mode = 'cycle', monthKey = '',
    controlCategories = [], budgetCategories = [], byCat = [], byCatMonth = [],
    cycleTxs = [], monthTxs = [], periodAdjustments = [],
    rewardSummary = null, monthTargetAll = 0, heroLens = 'sts',
    safeToSpend = null, fundModels = [],
  } = ctx;

  const spent = controlCategories.reduce((s, c) => s + usedFor(c, byCat), 0);
  const budget = controlCategories.reduce((s, c) => s + effectiveTargetFor(c, monthKey, mode, periodAdjustments), 0);
  const balance = budget - spent;
  const over = balance < 0;
  const usagePct = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0);

  const income = sumByTypes(mode === 'cycle' ? cycleTxs : monthTxs, ['transfer_in', 'settlement_in']);
  const fixedUsed = budgetCategories.filter(c => (c.budgetRhythm || 'spread') === 'fixed').reduce((s, c) => s + usedFor(c, byCatMonth), 0);
  const monthSpend = budgetCategories.reduce((s, c) => s + usedFor(c, byCatMonth), 0);
  const savingsRate = income > 0 ? Math.max(0, Math.round((income - monthSpend) / income * 100)) : 0;

  return {
    user: {
      name: shortName(user.name || user.email),
      greeting: '좋은 하루예요!',
      avatarInitial: firstChar(user.name || user.email || '나'),
    },
    period: {
      label: mode === 'cycle' ? cycleRangeLabel(cycleRange) : monthLabel(monthKey),
      cycleLabel: mode === 'cycle' ? '이번 2주' : '이번 달',
    },
    hero: buildHero({ heroLens, spent, budget, safeToSpend, over, usagePct, mode, monthKey, cycleTxs, monthTxs, cycleRange }),
    kpis: buildKpis({ income, fixedUsed, monthTargetAll, mode, fundModels }),
    funds: buildFundsSection(fundModels),
    categories: buildCategories(byCat),
    goals: buildGoals(budgetCategories, byCat, monthKey, mode, periodAdjustments),
    points: buildPoints(rewardSummary),
  };
}

// 히어로: A(Safe-to-Spend)가 기본 렌즈, '지금까지 쓴 돈'은 보조 렌즈.
function buildHero({ heroLens, spent, budget, safeToSpend, over, usagePct, mode, monthKey, cycleTxs, monthTxs, cycleRange }) {
  const sts = safeToSpend || {};
  const stsAmount = Number.isFinite(Number(sts.amount)) ? Math.round(Number(sts.amount)) : budget - spent;
  const stsNegative = stsAmount < 0;
  const daysRemaining = Math.max(0, Math.round(Number(sts.daysRemaining) || 0));
  const perDay = Math.max(0, Math.round(Number(sts.perDay) || 0));
  const provisions = Math.max(0, Math.round(Number(sts.provisions) || 0));
  return {
    lens: heroLens === 'spent' ? 'spent' : 'sts',
    sts: {
      amountText: signedNumber(stsAmount),
      negative: stsNegative,
      subText: stsNegative ? `남은 ${daysRemaining}일 · 여유 없음` : `남은 ${daysRemaining}일 · 하루 ${numText(perDay)}원`,
      badgeText: stsNegative ? `예산을 ${numText(stsAmount)}원 초과했어요` : `하루 ${numText(perDay)}원 쓸 수 있어요`,
      badgeTone: stsNegative ? 'danger' : 'success',
    },
    spentView: {
      amountText: numText(spent),
      overLabel: over ? '예산 초과' : '예산 안',
      overText: over ? `+${numText(spent - budget)}원 초과` : `${numText(budget - spent)}원 남음`,
    },
    spentLine: `지출 ${fmtKRW(spent)} / 예산 ${fmtKRW(budget)}${provisions ? ` (충당금 ${fmtKRW(provisions)} 차감)` : ''}`,
    usageText: `${roundHalf(usagePct)}% 사용`,
    usageTone: over ? 'danger' : (usagePct >= 85 ? 'warning' : 'success'),
    fillPercent: Math.min(100, Math.max(0, usagePct)),
    trend: buildTrend(mode === 'month' ? monthTxs : cycleTxs, trendWindow(mode, monthKey, cycleRange)),
    tooltip: '지금 여기',
  };
}

// 히어로 추세선의 기간 창: 2주 모드는 사이클(14일), 월 모드는 해당 월(그 달 일수).
function trendWindow(mode, monthKey, cycleRange) {
  if (mode === 'month') {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (y && m) return { start: new Date(y, m - 1, 1), days: new Date(y, m, 0).getDate() };
    return { start: null, days: 30 };
  }
  return { start: cycleRange?.start instanceof Date ? cycleRange.start : null, days: 14 };
}

function buildKpis({ income, fixedUsed, monthTargetAll, mode, fundModels }) {
  const activeFunds = (fundModels || []).filter(f => f.active !== false);
  const fundBalance = activeFunds.reduce((s, f) => s + (Number(f.balance) || 0), 0);
  const fundKpi = activeFunds.length
    ? { key: 'funds', label: '충당금', value: fmtKRW(fundBalance), sub: `${activeFunds.length}개 주머니`, tone: 'brand', icon: 'shield' }
    : { key: 'funds', label: '충당금', value: '없음', sub: '만들기 →', tone: 'brand', icon: 'shield' };
  return [
    { key: 'income', label: '수입', value: fmtKRW(income), sub: mode === 'cycle' ? '이번 2주' : '이번 달', tone: 'info', icon: 'income' },
    fundKpi,
    { key: 'fixed', label: '고정비', value: fmtKRW(fixedUsed), sub: '이번 달', tone: 'success', icon: 'trend' },
    { key: 'budget', label: '이번 달 예산', value: fmtKRW(monthTargetAll), sub: '예정', tone: 'warning', icon: 'wallet' },
  ];
}

// B(Sinking Fund): 충당금 잔액 섹션. 초과 인출은 경고 표시.
function buildFundsSection(fundModels) {
  const items = (fundModels || []).filter(f => f.active !== false).map(f => ({
    id: f.id,
    emoji: f.emoji || '🧰',
    name: f.name || '충당금',
    balanceText: fmtKRW(Number(f.balance) || 0),
    overdrawn: !!f.overdrawn,
  }));
  const monthly = (fundModels || []).filter(f => f.active !== false).reduce((s, f) => s + (Number(f.monthlyProvision) || 0), 0);
  return { items, monthlyText: monthly ? `매월 +${fmtKRW(monthly)} 적립` : '' };
}

function buildCategories(byCat) {
  const rows = (Array.isArray(byCat) ? byCat : [])
    .map(r => ({ label: r.name, amount: Number(r.expense) || 0 }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = rows.slice(0, 5);
  const restAmount = rows.slice(5).reduce((s, r) => s + r.amount, 0);
  const items = top.map((r, i) => ({
    id: i + 1, label: r.label,
    percent: total > 0 ? Math.round(r.amount / total * 100) : 0,
    amount: fmtKRW(r.amount),
  }));
  if (restAmount > 0) {
    items.push({ id: 6, label: '기타', percent: total > 0 ? Math.round(restAmount / total * 100) : 0, amount: fmtKRW(restAmount) });
  }
  return { total: fmtKRW(total), items };
}

// C(Envelope 재배분): 초과한 그룹은 가장 초과한 하위 카테고리를 재배분 타깃으로 노출.
function buildGoals(budgetCategories, byCat, monthKey, mode, adjustments) {
  return CATEGORY_ORDER.map(parent => {
    const cats = budgetCategories.filter(c => (c.parent || c.name) === parent);
    if (!cats.length) return null;
    const used = cats.reduce((s, c) => s + usedFor(c, byCat), 0);
    const target = cats.reduce((s, c) => s + effectiveTargetFor(c, monthKey, mode, adjustments), 0);
    const base = { name: parent, fraction: `${goalAmt(used)} / ${goalAmt(target)}`, iconKey: GOAL_ICON_KEYS[parent] || 'question' };
    if (target <= 0) return { ...base, percent: null, action: '설정하기' };
    const percent = Math.round(used / target * 100);
    if (percent <= 100) return { ...base, percent };
    const worst = cats
      .map(c => ({ label: c.name, over: usedFor(c, byCat) - effectiveTargetFor(c, monthKey, mode, adjustments) }))
      .sort((a, b) => b.over - a.over)[0];
    return {
      ...base,
      percent,
      realloc: worst && worst.over > 0 ? { label: worst.label, overage: Math.round(worst.over) } : undefined,
    };
  }).filter(Boolean);
}

function buildPoints(summary) {
  const buckets = summary && Array.isArray(summary.pointBuckets) ? summary.pointBuckets : [];
  const colors = { winePurchase: '#E86A6A', premiumIngredients: '#7C5CF0', travelFund: '#5B8FFF' };
  const fallback = ['#2FB8A8', '#F0A340', '#B277E6', '#5B8FFF'];
  return buckets.slice(0, 4).map((b, i) => {
    const pts = Math.round(Number(b.monthPoints) || 0);
    return {
      key: String(b.key || b.id || i),
      label: shortLabel(b.label),
      value: `${pts < 0 ? '−' : '+'}${Math.abs(pts).toLocaleString('ko-KR')}P`,
      direction: pts < 0 ? 'down' : 'up',
      color: colors[b.key] || fallback[i % fallback.length],
    };
  });
}

// ---------- helpers ----------
function sumByTypes(txs, types) {
  return (Array.isArray(txs) ? txs : []).filter(t => types.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
}
function buildTrend(txs, window = {}) {
  const start = window?.start instanceof Date ? window.start : null;
  const span = Math.max(1, Math.round(Number(window?.days) || 14));
  if (!start) return [8, 11, 10, 15, 13, 19, 22, 26, 23, 21];
  const buckets = new Array(10).fill(0);
  for (const tx of Array.isArray(txs) ? txs : []) {
    if (tx.type !== 'card_payment' && tx.type !== 'transfer_out') continue;
    const d = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
    if (Number.isNaN(d?.getTime?.())) continue;
    const day = Math.max(0, Math.min(span - 1, Math.floor((d - start) / 86400000)));
    const idx = Math.min(9, Math.floor(day / span * 10));
    buckets[idx] += Number(tx.amount) || 0;
  }
  let cum = 0;
  const series = buckets.map(v => (cum += v));
  return cum > 0 ? series : [8, 11, 10, 15, 13, 19, 22, 26, 23, 21];
}
function monthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return '이번 달';
  return `${y}년 ${m}월`;
}
function cycleRangeLabel(range) {
  const s = range?.start instanceof Date ? range.start : null;
  const e = range?.end instanceof Date ? range.end : null;
  if (!s || !e) return '이번 2주';
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}
function signedNumber(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ko-KR');
}
function numText(n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString('ko-KR'); }
function roundHalf(n) { const v = Math.round((Number(n) || 0) * 10) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1); }
function goalAmt(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000)}만`;
  return v.toLocaleString('ko-KR');
}
function shortName(v) { const s = String(v || '').split('@')[0]; return s.slice(0, 8) || '고객'; }
function firstChar(v) { return Array.from(String(v || '').split('@')[0].trim())[0] || '나'; }
function shortLabel(v) { return String(v || '').replace(/\s*포인트\s*$/, '').trim() || '포인트'; }

export { targetFor };
