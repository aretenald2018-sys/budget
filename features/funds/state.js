import { buildFundStatus } from '../../domain/funds/provision.js';

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

// 기간 귀속: 2주 모드는 이번 주기에 기록된 결정만, 월 모드는 이번 달 전체.
export function filterPeriodAdjustments(adjustments = [], { mode, monthKey, cycleStartDate } = {}) {
  return (Array.isArray(adjustments) ? adjustments : []).filter(adj => mode === 'cycle'
    ? adj.scope === 'cycle' && adj.cycleStartDate === cycleStartDate
    : adj.monthKey === monthKey);
}

export function localISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
