import { fmtMonthKey } from '../../utils/format.js';

export const reportState = {
  // 이 값은 모듈이 로드될 때 한 번 정해진다. 그런데 e2e 픽스처의 고정 시계는 첫 데이터
  // 접근에서야 설치되므로, 여기에는 픽스처 기준 시각이 아니라 실제 달이 들어간다.
  // 그래서 리포트 탭의 월 내비만 다른 달을 가리켰고, 달이 바뀌는 날 시각 회귀가
  // 저 혼자 깨졌다. 첫 렌더에서 다시 맞춘다(monthKeyUserSet 참조).
  monthKey: fmtMonthKey(new Date()),
  monthKeyUserSet: false,
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
