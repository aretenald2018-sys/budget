# 2026-07-01~03 토스 결제기록 원장 보정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`
- 실행: `docs/ai/executions/2026-07-03-toss-july-record-reconciliation.md`
- 스크립트: `scripts/reconcile-toss-july-records.mjs`
- 운영 Firestore 보정 결과

## 결과

차단 이슈 없음.

## 확인

- raw message 삭제는 수행하지 않았다.
- 중복 거래는 삭제 대신 `hidden`, `excludedFromBudget`, `excludeFromBudget`, `excludeReason` 플래그로 합계에서 제외했다.
- 2026-07-01 중복 제외 합계는 `197,890원`으로, 앱 기존 `519,780원`에서 제외하면 토스 기준 `321,890원`이 된다.
- 2026-07-02 `2,800원`, 2026-07-03 `13,890원`은 같은 날짜/금액 visible 거래가 없을 때만 생성됐다.
- 보정 후 dry-run에서 남은 중복 후보와 누락 생성 후보가 모두 0건이다.
- 보정 후 합계:
  - 2026-07-01: `321,890원`
  - 2026-07-02: `2,800원`
  - 2026-07-03: `16,090원`
  - 합계: `340,780원`

## 남은 검증

- 운영 UI 직접 확인은 not verified yet이다. 사용자는 `https://aretenald2018-sys.github.io/budget/` 로그인 후 거래 탭 2026년 7월에서 위 날짜별 합계를 확인하면 된다.
