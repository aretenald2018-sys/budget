# 토스 김태우 캘린더 제외 진단

## 요청

- `토스 김태우`로 보내는 거래내역은 자전거래이므로 캘린더에 올리지 않는다.

## 재현/피드백 루프

- 코드 검색:
  - `render-tx.js`의 월간 캘린더는 `card_payment`/`transfer_out` 중 `!isBudgetExcluded(tx)`인 거래만 daily spend로 올린다.
  - `data.js`의 `isBudgetExcluded(tx)`는 현재 `excludedFromBudget`, `excludeFromBudget`, 환급 예정 거래만 본다.
  - `scripts/export-calendar-csv.mjs`도 별도 `isBudgetExcluded(tx)` 구현을 가지고 있고 같은 한계가 있다.
- 데이터 증거:
  - `budget-calendar-2026-06.csv`에 `토스 김태우`가 `daily_spend`로 남아 있다.
  - `reports/consumption-timeline-2026-06.md`는 이미 `토스 김태우 9,500,085원 / 10건`을 제외 대상으로 기록했다.

## 가설

1. 기존 `토스 김태우` 거래가 `excludedFromBudget`으로 백필되지 않았기 때문에 캘린더에 올라간다.
2. 새 유입 거래도 `api/_lib/auto-ingest.js` 단계에서 `excludedFromBudget`을 자동 저장하지 않아 같은 문제가 반복된다.
3. CSV export는 브라우저 `data.js` helper를 공유하지 않아, 앱 화면을 고쳐도 export 결과에는 계속 남을 수 있다.
4. `internal_transfer`로 타입을 바꾸면 캘린더에서는 빠지지만 원본 송금 기록 구분이 흐려질 수 있다.

## 확인 결과

- 과거 계획 `docs/ai/features/2026-06-30-consumption-cleanup-choice-removal-naverpay.md`의 슬라이스 2에 이미 `토스 김태우` 제외가 계획되어 있었으나, 선택 탭 삭제 슬라이스에서 해당 작업은 섞지 않았다고 리뷰에 기록되어 있다.
- 현재 코드에는 `self_transfer_toss_kim_taewoo` 또는 `토스 김태우` 판정 helper가 없다.
- `render-tx.js`, `render-report.js`, `data.js`, `scripts/export-calendar-csv.mjs`는 모두 `isBudgetExcluded` 계열 helper만 믿고 소비성 집계를 만든다.

## 진단 결론

- 해결은 캘린더 화면에서만 문자열을 숨기는 것이 아니라, 공통 제외 helper에 `토스 김태우` 자전거래 판정을 추가해야 한다.
- 새 거래 저장 경로에서는 `excludedFromBudget: true`, `excludeReason: "self_transfer_toss_kim_taewoo"`를 자동 부여한다.
- 기존 Firestore 대량 백필 없이도 화면/리포트/CSV는 helper로 즉시 제외되게 만들고, 백필은 별도 운영 작업으로 남긴다.
