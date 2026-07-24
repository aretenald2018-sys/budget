// ================================================================
// features/home/model.js — 홈 대시보드 데이터 모델 빌더
// renderReport(homeMode)가 로드한 데이터로 dashboard.js가 쓸 모델을 만든다.
// 순수 함수(입력 → 모델). 데이터 접근·Firestore 없음.
// ================================================================

import { effectiveTargetFor, targetFor, usedFor } from '../report/budget-summary/state.js';
import { fmtKRW, fmtKRWShort } from '../../utils/format.js';

// KPI 칩은 4열이라 폭이 좁다 — 7자리 금액이 잘리지 않도록 축약 표기(예: 255만원).
function kpiMoney(n) { return `${fmtKRWShort(Math.round(Number(n) || 0))}원`; }

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
    safeToSpend = null, fundModels = [], reviewCount = 0, now = new Date(),
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
      greeting: greetingFor(now),
      avatarInitial: firstChar(user.name || user.email || '나'),
    },
    review: { count: Math.max(0, Math.round(Number(reviewCount) || 0)) },
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
  const lens = heroLens === 'spent' ? 'spent' : 'sts';
  // STS 렌즈의 바/사용률은 충당금 차감 후 가용액(B−P+A) 기준 — 히어로 본문과 같은 분모.
  const stsAvailable = Math.round(Number(sts.available) || 0);
  const stsSpent = Math.round(Number(sts.spent) || 0);
  const stsUsagePct = stsAvailable > 0
    ? (stsSpent / stsAvailable) * 100
    : (Number.isFinite(Number(sts.spentRatio)) ? Number(sts.spentRatio) * 100 : usagePct);
  const heroUsagePct = lens === 'sts' && (stsAvailable > 0 || Number.isFinite(Number(sts.spentRatio))) ? stsUsagePct : usagePct;
  const heroOver = lens === 'sts' ? stsNegative : over;
  const trend = buildTrend(mode === 'month' ? monthTxs : cycleTxs, trendWindow(mode, monthKey, cycleRange));
  const trendBudget = Math.round(Number(budget) || 0);
  return {
    lens,
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
      overTone: over ? 'danger' : 'success',
    },
    spentLine: `지출 ${fmtKRW(spent)} / 예산 ${fmtKRW(budget)}${provisions ? ` (충당금 ${fmtKRW(provisions)} 차감)` : ''}`,
    // 히어로 하단 서브라인 — 스크린샷 형식. 렌즈별로 문구가 다르다.
    stsFoot: `예산 ${fmtKRW(budget)} · 사용 ${fmtKRW(spent)}`,
    spentFoot: `예산 ${fmtKRW(budget)} · ${over ? `예산 초과 ${numText(spent - budget)}원` : `${numText(budget - spent)}원 남음`}`,
    usageText: `${roundHalf(heroUsagePct)}% 사용`,
    usageTone: heroOver ? 'danger' : (heroUsagePct >= 85 ? 'warning' : 'success'),
    trend,
    // '써도 되는 돈' 곡선: 남은 돈 = 예산 − 누적 지출 (감소 곡선). 같은 누적 시리즈에서 파생.
    trendRemaining: remainingTrend(trend, trendBudget),
    // 추세선을 실제 지출 수준과 연결: 예산을 기준(상한)으로, 끝점은 히어로 '쓴 돈'(spent)에 맞춘다.
    trendBudget,
    trendSpent: Math.round(Number(spent) || 0),
    tooltip: '지금 여기',
  };
}

// 잔여 시리즈 = 예산 − 누적 지출. 0 미만(초과)은 0으로 바닥 처리해 '남은 돈' 의미를 유지한다.
function remainingTrend(cumulative, budget) {
  const b = Math.max(0, Number(budget) || 0);
  const series = Array.isArray(cumulative) ? cumulative : [];
  if (!b || series.length < 2) return [];
  return series.map(v => Math.max(0, b - (Number(v) || 0)));
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
  // 충당금·이번 달 예산은 목표(finance) 탭에 대응 섹션이 없어 설정 탭에 유지한다.
  // 고정비는 목표(finance) 탭의 현금흐름(저축 가능액) 맥락과 이어져 목표 탭으로 연결한다.
  const fundAction = { tab: 'settings', scrollTo: 'settings-funds-section' };
  const fundKpi = activeFunds.length
    ? { key: 'funds', label: '충당금', value: kpiMoney(fundBalance), sub: `${activeFunds.length}개 주머니`, tone: 'brand', icon: 'shield', action: fundAction }
    : { key: 'funds', label: '충당금', value: '없음', sub: '만들기 →', tone: 'brand', icon: 'shield', action: fundAction };
  return [
    { key: 'income', label: '수입', value: kpiMoney(income), sub: mode === 'cycle' ? '이번 2주' : '이번 달', tone: 'info', icon: 'income', action: { tab: 'tx' } },
    fundKpi,
    { key: 'fixed', label: '고정비', value: kpiMoney(fixedUsed), sub: '이번 달', tone: 'success', icon: 'trend', action: { tab: 'finance' } },
    { key: 'budget', label: '이번 달 예산', value: kpiMoney(monthTargetAll), sub: '예정', tone: 'warning', icon: 'wallet', action: { tab: 'settings' } },
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
    id: i + 1, label: r.label, drillName: r.label,
    percent: total > 0 ? Math.round(r.amount / total * 100) : 0,
    amount: fmtKRW(r.amount),
  }));
  if (restAmount > 0) {
    items.push({ id: 6, label: '기타', drillName: '', percent: total > 0 ? Math.round(restAmount / total * 100) : 0, amount: fmtKRW(restAmount) });
  }
  return { total: fmtKRW(total), items };
}

// C(Envelope 재배분): 초과한 그룹은 가장 초과한 하위 카테고리를 재배분 타깃으로 노출.
// children은 목표 상세 모달(하위 카테고리별 게이지 + 재배분)용.
function buildGoals(budgetCategories, byCat, monthKey, mode, adjustments) {
  return CATEGORY_ORDER.map(parent => {
    const cats = budgetCategories.filter(c => (c.parent || c.name) === parent);
    if (!cats.length) return null;
    const children = cats.map(c => {
      const cUsed = usedFor(c, byCat);
      const cTarget = effectiveTargetFor(c, monthKey, mode, adjustments);
      return {
        id: c.id || null,
        label: c.name,
        used: Math.round(cUsed),
        target: Math.round(cTarget),
        percent: cTarget > 0 ? Math.round(cUsed / cTarget * 100) : null,
        over: Math.round(cUsed - cTarget),
      };
    });
    const used = children.reduce((s, c) => s + c.used, 0);
    const target = children.reduce((s, c) => s + c.target, 0);
    const base = {
      name: parent,
      fraction: `${goalAmt(used)} / ${goalAmt(target)}`,
      iconKey: GOAL_ICON_KEYS[parent] || 'question',
      children,
    };
    if (target <= 0) return { ...base, percent: null, action: '설정하기' };
    const percent = Math.round(used / target * 100);
    if (percent <= 100) return { ...base, percent };
    const worst = [...children].sort((a, b) => b.over - a.over)[0];
    return {
      ...base,
      percent,
      realloc: worst && worst.over > 0
        ? { id: worst.id, label: worst.label, overage: Math.max(0, worst.over) }
        : undefined,
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
function greetingFor(now) {
  const h = (now instanceof Date ? now : new Date(now)).getHours();
  if (h >= 5 && h < 12) return '좋은 아침이에요!';
  if (h >= 12 && h < 18) return '좋은 오후예요!';
  if (h >= 18 && h < 23) return '편안한 저녁이에요!';
  return '오늘도 수고했어요';
}
function shortName(v) { const s = String(v || '').split('@')[0]; return s.slice(0, 8) || '고객'; }
function firstChar(v) { return Array.from(String(v || '').split('@')[0].trim())[0] || '나'; }
function shortLabel(v) { return String(v || '').replace(/\s*포인트\s*$/, '').trim() || '포인트'; }

export { targetFor };
