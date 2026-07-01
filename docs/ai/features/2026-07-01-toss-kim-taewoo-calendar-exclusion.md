# 토스 김태우 캘린더 제외 계획

## 요청

- `토스 김태우`로 보내는 거래내역은 자전거래이므로 캘린더에 올리지 않는다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-01-toss-kim-taewoo-calendar-exclusion.md`
- 캘린더는 이미 `isBudgetExcluded(tx)`를 거치지만, 현재 helper가 `토스 김태우`를 자동 제외하지 않는다.
- `budget-calendar-2026-06.csv`에는 `토스 김태우`가 daily spend로 남아 있다.
- `reports/consumption-timeline-2026-06.*`에는 수동 제외 기준으로 이미 `토스 김태우` 10건을 제외한 기록이 있다.

## 그릴 결과

- 핵심 질문: 원본 거래 타입을 `internal_transfer`로 바꿀지, 원본 타입은 보존하고 소비/캘린더에서 제외할지?
- 기존 계획의 결정: 원본 거래는 보존하고 `excludedFromBudget: true`, `excludeReason: "self_transfer_toss_kim_taewoo"`로 제외한다.
- 이번 결정: 기존 결정을 유지한다. 기존 DB 문서가 백필되지 않아도 화면/CSV 집계 helper에서 `토스 김태우`를 동적으로 제외한다.
- 남은 가정: 제외 대상은 정확히 `토스 김태우` 송금만이다. `토스 김윤슬`, `토스 경찰청＿`, `토스페이먼츠` 등은 제외하지 않는다.

## 실행 슬라이스 1 - 토스 김태우 자전거래 공통 제외

### 목표

- 거래 탭 월간 캘린더와 일별 금액에서 `토스 김태우` 송금을 제외한다.
- 홈/리포트 소비 합계와 CSV export에서도 같은 기준으로 제외한다.
- 새로 들어오는 `토스 김태우` `transfer_out` 거래에는 제외 필드를 자동 저장한다.
- 기존 거래는 Firestore 백필 없이도 UI/집계에서 즉시 제외되게 한다.

### 예상 변경 파일

- `data.js`
- `api/_lib/auto-ingest.js`
- `scripts/export-calendar-csv.mjs`
- `scripts/verify-project.mjs`
- 필요 시 `scripts/reprocess-pending-raw.mjs`
- `docs/ai/features/2026-07-01-toss-kim-taewoo-calendar-exclusion.md`
- `docs/ai/NEXT_ACTION.md`

### 범위 제외

- 과거 Firestore 문서 대량 백필
- 모든 `토스` 송금 제외
- 다른 수취인 자동 제외
- 거래 탭 라벨 변경
- 홈 CSS 복구 작업

### 구현 메모

- `data.js`에 `SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON`과 `isTossKimTaewooSelfTransfer(tx)`를 추가한다.
- 판정은 `transfer_out` 거래 중 `merchant`, `counterparty`, `body` 중 하나의 정규화 텍스트가 `토스김태우`를 포함하는 경우로 제한한다.
- `isBudgetExcluded(tx)`는 기존 조건에 `isTossKimTaewooSelfTransfer(tx)`를 추가한다.
- `saveTransaction()` 경로에서 새 거래가 해당 조건이면 `excludedFromBudget: true`, `excludeReason: SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON`을 저장한다.
- 서버 자동 ingest 경로인 `api/_lib/auto-ingest.js`에서도 같은 저장 필드를 부여한다.
- `scripts/export-calendar-csv.mjs`는 브라우저 `data.js`를 직접 공유하지 않으므로 동일 helper 또는 공유 유틸을 사용하게 한다.
- 검증 스크립트에는 fixture를 추가한다.
  - `토스 김태우` `transfer_out`은 excluded.
  - `토스 김윤슬`, `토스 경찰청＿`, `토스페이먼츠`는 not excluded.

## 검증 계획

- `npm.cmd run verify`
- 가능하면 CSV fixture/스크립트 수준에서 `토스 김태우` daily spend 미포함 확인
- 정상 터미널에서 `npm.cmd run dev`
- `http://localhost:5501/` 거래 탭 월간 캘린더 확인
- 증명 기준:
  - `토스 김태우` 금액이 캘린더 날짜 금액과 월간 소비 합계에 더해지지 않는다.
  - 거래 목록에는 원본 거래가 남아 추적 가능하다.
  - 다른 `토스` 수취인은 기존처럼 표시된다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-01-toss-kim-taewoo-calendar-exclusion.md`의 실행 슬라이스 1을 구현한다. `토스 김태우` `transfer_out`을 공통 `isBudgetExcluded` 기준과 새 ingest 저장 경로에서 제외하고, 캘린더/리포트/CSV 검증 fixture를 추가한다.
