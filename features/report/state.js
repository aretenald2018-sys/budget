import { fmtMonthKey } from '../../utils/format.js';

export const reportState = {
  monthKey: fmtMonthKey(new Date()),
  // 기본 보기는 설정 > 전체 예산의 '예산 적용 주기'를 따른다(render-report 에서 주입).
  // 사용자가 화면에서 직접 1주/2주/이번 달을 누르면 viewModeUserSet 이 켜져 그 선택이 우선.
  viewMode: 'cycle',
  viewModeUserSet: false,
  monthTxs: [],
  cycleTxs: [],
  categories: [],
  rootSelector: '#tab-report',
  homeMode: false,
  activeDrill: null,
  // 앵커는 보기 모드마다 따로 있다 — 1주로 보든 2주로 보든 각자 시작일을 가진다.
  budgetCycle: 'biweekly',
  weeklyStartDate: '',
  biweeklyStartDate: '',
  cycleRange: null,
  rewardPointEntries: [],
  rewardPointItems: [],
  rewardSummary: null,
  heroLens: 'sts',
  homeGoals: [],
};
