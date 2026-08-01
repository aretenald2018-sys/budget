import { buildFundStatus } from '../../domain/funds/provision.js';
import { isPeriodMode } from '../../domain/budget/model.js';

// 홈 렌더 시 채워지는 충당금 컨텍스트. 모달(상세/재배분)이 이 스냅샷을 읽는다.
export const fundsState = {
  funds: [],
  drawTxsByFund: {},
  adjustments: [],
  periodAdjustments: [],
  categories: [],
  byCategory: [],
  monthKey: '',
  mode: 'cycle',
  cycleStartDate: '',
};

export function setFundContext(patch = {}) {
  Object.assign(fundsState, patch);
}

export function buildFundCardModels(funds = [], drawTxsByFund = {}, adjustments = [], now = new Date()) {
  return (Array.isArray(funds) ? funds : [])
    .filter(fund => fund.active || (drawTxsByFund[fund.id] || []).length)
    .map(fund => {
      const draws = drawTxsByFund[fund.id] || [];
      return {
        ...buildFundStatus(fund, draws, adjustments, now),
        recentDraws: draws.slice(0, 8),
      };
    });
}

// 기간 귀속: 1주·2주 모드는 이번 주기에 기록된 결정만, 월 모드는 이번 달 전체.
//
// cycleStartDate 정확 일치만 보면, 기간 길이를 바꾸는 순간(2주 → 1주) 오늘 기록한
// 재배분이 홈 '써도 되는 돈'에서 사라진다. 2주 창의 시작일(07-14)과 1주 창의
// 시작일(07-21)이 다른 문자열이기 때문이다. 삭제된 게 아니라 안 보일 뿐이지만,
// 오늘 한 결정이 오늘 사라지는 건 그 자체로 버그다. 그래서 키가 어긋나면
// 기록 시각이 지금 창 안에 있는지로 한 번 더 본다.
export function filterPeriodAdjustments(adjustments = [], { mode, monthKey, cycleStartDate, periodRange } = {}) {
  return (Array.isArray(adjustments) ? adjustments : []).filter(adj => {
    if (!isPeriodMode(mode)) return adj.monthKey === monthKey;
    if (adj.scope !== 'cycle') return false;
    if (adj.cycleStartDate === cycleStartDate) return true;
    return occurredWithin(adj.occurredAt, periodRange);
  });
}

function occurredWithin(value, range) {
  if (!(range?.start instanceof Date) || !(range?.end instanceof Date)) return false;
  const at = toDate(value);
  if (!at) return false;
  return at.getTime() >= range.start.getTime() && at.getTime() <= range.end.getTime();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function localISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
