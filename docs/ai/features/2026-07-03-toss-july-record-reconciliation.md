# 2026-07-01~03 토스 결제기록 원장 보정 계획

## 요청 원문

> 내 앱 기록을 토스앱 캡쳐랑 결제기록 맞출 것

## 이해한 내용

- 목표: 첨부된 토스 앱 캡처를 기준으로 2026-07-01~2026-07-03 앱 원장 소비 합계를 `340,780원`으로 맞춘다.
- 비목표:
  - raw message 삭제.
  - Gemini/API secret 이동.
  - 홈/거래 UI 디자인 변경.
  - Firestore read quota가 소진된 상태에서 문서 id 확인 없이 임의 보정.
- 사용자 흐름: 사용자가 운영 앱 거래 탭에서 2026년 7월을 열면 1일 `321,890원`, 2일 `2,800원`, 3일 `16,090원`, 월 합계 `340,780원`이 보여야 한다.
- 데이터 가정:
  - 토스증권 905,887원은 투자/자기이체라 소비 합계에서 제외한다.
  - T맵 0원/취소선 거래는 소비로 만들지 않는다.
  - 중복 거래는 삭제하지 않고 숨김 또는 예산 제외 플래그로 합계에서 제외한다.
- 열려 있는 질문:
  - 없음.

## 그릴 결과

- 적용 트리거: `/diagnose`
- 핵심 질문: 중복으로 보이는 거래를 삭제할지, 원장은 유지하고 소비 합계에서 제외할지?
- 추천 답변: 원장은 유지하고 `hidden` 또는 `excludedFromBudget`으로 제외한다.
- 사용자 답변: 명시 답변 없음.
- 확정된 결정: raw message 삭제 금지와 기존 `isBudgetExcluded()` 구조를 따라 삭제 대신 숨김/예산 제외로 처리한다.
- 남은 가정: 없음. Firestore read quota 회복 후 보정과 dry-run 검증을 완료했다.

## 결정 기록

- 결정: 누락 추가보다 중복 제외를 먼저 수행한다.
- 이유: 현재 앱 월 합계에서 누락 2건을 먼저 추가하면 토스 합계와의 차이가 더 커진다.
- 되돌릴 수 있는가: 가능. `hidden`, `excludedFromBudget`, `excludeReason` 플래그는 후속 patch로 되돌릴 수 있다.

## 실행 슬라이스

### 슬라이스 1: Firestore 원장 대조 및 보정

- 목표:
  - 2026-07-01~03 운영 transactions를 조회해 토스 기준으로 중복/누락을 보정한다.
- 상태: 완료
- 범위:
  - 2026-07-01 중복 후보 6건을 문서 id 기준으로 특정한다.
  - 정상 소비 8건과 토스증권 제외 1건은 유지한다.
  - 2026-07-02 `CU 문정엠스테이트점` 2,800원과 2026-07-03 `송파농협 하나로마트` 13,890원을 기존 문서가 없을 때만 추가한다.
- 예상 수정 파일:
  - 운영 Firestore `users/{USER_UID}/transactions`
  - `docs/ai/executions/2026-07-03-toss-july-record-reconciliation.md`
  - `docs/ai/reviews/2026-07-03-toss-july-record-reconciliation-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - raw message 삭제.
  - 2026-07-01 정상 소비 txId 8건 삭제.
  - 토스증권 905,887원을 소비로 포함.
  - T맵 0원/취소선 거래 생성.
  - 앱 UI/CSS/Android parser 변경.
- 구현 메모:
  - 중복 후보는 삭제하지 말고 `hidden: true`, `duplicateOf`, `duplicateReason: "toss_july_reconciliation"`, `excludedFromBudget: true`, `excludeReason: "duplicate_toss_july_reconciliation"` 중 기존 렌더링에 가장 안전한 조합으로 처리한다.
  - 추가 거래에는 `source: "manual_toss_reconciliation"`, `needsReview: false`, `memo`에 토스 캡처 기준 보정임을 남긴다.
  - read quota가 계속 실패하면 쓰기 작업을 하지 않는다.
- 검증 방법:
  1. Firestore dry-run 조회로 2026-07-01~03 거래 목록과 합계 출력.
  2. 보정 적용.
  3. 같은 조회를 재실행해 날짜별 소비 합계가 2026-07-01 `321,890`, 2026-07-02 `2,800`, 2026-07-03 `16,090`, 월 합계 `340,780`인지 확인.
  4. 가능하면 운영 앱 `https://aretenald2018-sys.github.io/budget/` 로그인 후 거래 탭 2026년 7월 화면에서 같은 UI 상태 확인.
- 완료 증거:
  - Firestore 보정 결과의 날짜별 합계.
  - 운영 UI 거래 탭에서 7월 합계/일별 합계가 토스 캡처와 일치.
- 다음 세션 시작 프롬프트:
  - `docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`의 슬라이스 1만 실행한다. Firestore read quota가 회복됐는지 먼저 확인하고, quota가 계속 실패하면 데이터 쓰기를 하지 말고 차단 상태를 유지한다.

## 리뷰 세션 프롬프트

`docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`의 슬라이스 1 결과를 리뷰한다. 중복 제외/누락 추가가 토스 캡처의 2026-07-01 `321,890원`, 2026-07-02 `2,800원`, 2026-07-03 `16,090원`, 월 `340,780원`과 일치하는지 확인하고, raw message 삭제나 토스증권 소비 포함이 없는지 검토한다.

## NEXT_ACTION.md 업데이트

- 계획/실행/리뷰 종료 상태: complete
- 다음 자동 상태: `complete`
- 다음 액션: 없음
- 차단 질문: 없음
