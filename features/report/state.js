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
  rewardPointEntries: [],
  rewardPointItems: [],
  rewardSummary: null,
  heroLens: 'sts',
  homeGoals: [],
};
