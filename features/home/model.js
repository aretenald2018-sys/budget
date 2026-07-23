// ================================================================
// features/home/model.js — 홈 대시보드 데이터 모델 빌더
// renderReport(homeMode)가 로드한 데이터로 dashboard.js가 쓸 모델을 만든다.
// 순수 함수(입력 → 모델). 데이터 접근·Firestore 없음.
// ================================================================

import { effectiveTargetFor, targetFor, usedFor } from '../report/budget-summary/state.js';
import { fmtKRW } from '../../utils/format.js';

const CATEGORY_ORDER = ['생활유지비', '자아유지비', '변동비', '미분류'];
const GOAL_META = {
  생활유지비: { color: '#7C5CF0', icon: '🏠' },
  자아유지비: { color: '#B277E6', icon: '🌿' },
  변동비: { color: '#3BD68F', icon: '🍷' },
  미분류: { color: '#98A4BC', icon: '❔' },
};

export function buildHomeModel(ctx = {}) {
  const {
    user = {}, cycleRange = {}, mode = 'cycle', monthKey = '',
    controlCategories = [], budgetCategories = [], byCat = [], byCatMonth = [],
    cycleTxs = [], monthTxs = [], periodAdjustments = [],
    rewardSummary = null, devIdeas = [], monthTargetAll = 0,
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
      label: cycleRangeLabel(cycleRange),
      cycleLabel: mode === 'cycle' ? '이번 2주' : (monthKey || '이번 달'),
    },
    hero: {
      label: '지금까지 쓴 돈',
      amountText: signedNumber(balance),
      overLabel: over ? '예산 초과' : '예산 잔액',
      overText: over ? `+${numText(spent - budget)}원 초과` : `${numText(balance)}원 남음`,
      spent, budget,
      usageText: `${roundHalf(usagePct)}% 사용`,
      usageTone: over ? 'danger' : (usagePct >= 85 ? 'warning' : 'success'),
      fillPercent: Math.min(100, Math.max(0, usagePct)),
      trend: buildTrend(cycleTxs, cycleRange),
      tooltip: '지금 여기',
    },
    kpis: [
      { key: 'income', label: '수입', value: fmtKRW(income), sub: mode === 'cycle' ? '이번 2주' : '이번 달', tone: 'info', icon: 'income' },
      { key: 'fixed', label: '고정비', value: fmtKRW(fixedUsed), sub: '이번 달', tone: 'brand', icon: 'trend' },
      { key: 'savings', label: '저축률', value: `${savingsRate}%`, sub: '이번 달', tone: 'success', icon: 'trend' },
      { key: 'budget', label: '이번 달 예산', value: fmtKRW(monthTargetAll), sub: '예정', tone: 'warning', icon: 'wallet' },
    ],
    categories: buildCategories(byCat),
    goals: buildGoals(budgetCategories, byCat, monthKey, mode, periodAdjustments),
    points: buildPoints(rewardSummary),
    devIdeas: buildDevIdeas(devIdeas),
  };
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

function buildGoals(budgetCategories, byCat, monthKey, mode, adjustments) {
  return CATEGORY_ORDER.map(parent => {
    const cats = budgetCategories.filter(c => (c.parent || c.name) === parent);
    if (!cats.length) return null;
    const used = cats.reduce((s, c) => s + usedFor(c, byCat), 0);
    const target = cats.reduce((s, c) => s + effectiveTargetFor(c, monthKey, mode, adjustments), 0);
    const meta = GOAL_META[parent] || { color: '#98A4BC', icon: '•' };
    const base = { name: parent, fraction: `${goalAmt(used)} / ${goalAmt(target)}`, color: meta.color, icon: meta.icon };
    if (target <= 0) return { ...base, percent: null, action: '설정하기' };
    return { ...base, percent: Math.round(used / target * 100) };
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

function buildDevIdeas(ideas) {
  const list = Array.isArray(ideas) ? ideas : [];
  const running = list.filter(i => devStatus(i) === 'running' || devStatus(i) === 'pending').length;
  return {
    runningLabel: `${running}개 진행중`,
    items: list.slice(0, 4).map(i => ({
      title: i.title || '제목 없음',
      status: devStatusLabel(devStatus(i)),
      done: devStatus(i) === 'done',
    })),
  };
}

// ---------- helpers ----------
function sumByTypes(txs, types) {
  return (Array.isArray(txs) ? txs : []).filter(t => types.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
}
function buildTrend(cycleTxs, cycleRange) {
  const start = cycleRange?.start instanceof Date ? cycleRange.start : null;
  if (!start) return [8, 11, 10, 15, 13, 19, 22, 26, 23, 21];
  const buckets = new Array(10).fill(0);
  for (const tx of Array.isArray(cycleTxs) ? cycleTxs : []) {
    if (tx.type !== 'card_payment' && tx.type !== 'transfer_out') continue;
    const d = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
    if (Number.isNaN(d?.getTime?.())) continue;
    const day = Math.max(0, Math.min(13, Math.floor((d - start) / 86400000)));
    const idx = Math.min(9, Math.floor(day / 14 * 10));
    buckets[idx] += Number(tx.amount) || 0;
  }
  let cum = 0;
  const series = buckets.map(v => (cum += v));
  return cum > 0 ? series : [8, 11, 10, 15, 13, 19, 22, 26, 23, 21];
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
function devStatus(idea) {
  const s = String(idea?.status || '').trim();
  if (['pending', 'running', 'done', 'failed'].includes(s)) return s;
  return idea?.done ? 'done' : 'pending';
}
function devStatusLabel(s) { return ({ pending: '진행전', running: '진행중', done: '완료', failed: '오류' })[s] || '진행전'; }

export { targetFor };
