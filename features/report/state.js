import { fmtMonthKey } from '../../utils/format.js';

export const reportState = {
  monthKey: fmtMonthKey(new Date()),
  viewMode: 'cycle',
  monthTxs: [],
  cycleTxs: [],
  categories: [],
  rootSelector: '#tab-report',
  homeMode: false,
  activeDrill: null,
  biweeklyStartDate: '',
  cycleRange: null,
  // 기간 설정 SSOT(appSettings.budget)의 렌더 스냅샷 — domain/budget/period.js resolveBudgetPeriod
  budgetPeriod: null,
  cycleDays: 14,
  periodLabel: '이번 2주',
  rewardPointEntries: [],
  rewardPointItems: [],
  rewardSummary: null,
  heroLens: 'sts',
  homeGoals: [],
};
