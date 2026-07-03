# 2026-07-01~03 토스 결제기록 원장 보정 실행

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`
- 실행 슬라이스: 슬라이스 1 - Firestore 원장 대조 및 보정
- 앱 UI/CSS/Android parser는 변경하지 않았다.
- raw message는 삭제하지 않았다.

## 변경 파일

- `scripts/reconcile-toss-july-records.mjs`
- `docs/ai/diagnoses/2026-07-03-toss-july-record-reconciliation.md`
- `docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`
- `docs/ai/executions/2026-07-03-toss-july-record-reconciliation.md`
- `docs/ai/reviews/2026-07-03-toss-july-record-reconciliation-review.md`
- `docs/ai/NEXT_ACTION.md`

## 실행 내용

운영 Firestore read quota는 2026-07-03 16:04 KST에 1건 조회가 성공해 회복을 확인했다.

`node scripts/reconcile-toss-july-records.mjs` dry-run으로 2026-07-01~03 원장을 조회했다.

보정 전 합계:

| 날짜 | 앱 합계 | 토스 기준 |
| --- | ---: | ---: |
| 2026-07-01 | 519,780 | 321,890 |
| 2026-07-02 | 0 | 2,800 |
| 2026-07-03 | 2,200 | 16,090 |
| 합계 | 521,980 | 340,780 |

## 중복 제외

다음 6개 transaction을 삭제하지 않고 숨김/예산 제외 처리했다.

| txId | 거래 | 금액 | 처리 |
| --- | --- | ---: | --- |
| `oHUxgq9ZqG0MkPG4TFlF` | 마인드풀상담심리 | 120,000 | `hidden: true`, `excludedFromBudget: true` |
| `wtVHKOVpbq63jLqCqCgW` | 워커스하이 | 1,440 | `hidden: true`, `excludedFromBudget: true` |
| `XMb2kyNwTaG1VWVCRqSN` | 워커스하이 | 1,280 | `hidden: true`, `excludedFromBudget: true` |
| `qYUJz1j25ZDK3bEWFhqh` | 워커스하이 | 1,120 | `hidden: true`, `excludedFromBudget: true` |
| `1f2Kw33qNLXtcxowEfGs` | 쿠팡(쿠페이) | 19,050 | `hidden: true`, `excludedFromBudget: true` |
| `hbIBsrkd5JF4ODVs3zgZ` | 티머니 | 55,000 | `hidden: true`, `excludedFromBudget: true` |

제외 합계: `197,890원`.

## 누락 추가

다음 2개 transaction을 `source: "manual_toss_reconciliation"`로 생성했다.

| txId | 날짜 | 거래 | 금액 |
| --- | --- | --- | ---: |
| `alRkmoYHamiHZsyBuKF4` | 2026-07-02 14:21 | CU 문정엠스테이트점 | 2,800 |
| `ENXqJzJsl6LRUpTvIDPb` | 2026-07-03 12:00 | 송파농협 하나로마트 | 13,890 |

추가 합계: `16,690원`.

## 검증

1. `node scripts/reconcile-toss-july-records.mjs --apply`
   - 적용 후 날짜별 합계가 토스 기준과 일치했다.
2. `node scripts/reconcile-toss-july-records.mjs`
   - `DUPLICATE_CANDIDATES`: `[]`
   - `MISSING_CREATES`: `[]`
   - 날짜별 합계:
     - 2026-07-01: `321,890`
     - 2026-07-02: `2,800`
     - 2026-07-03: `16,090`
     - 합계: `340,780`

## 남은 검증

- 운영 UI에서 로그인 후 거래 탭 2026년 7월 화면이 위 합계로 보이는지 직접 눈으로 보는 검증은 not verified yet이다.
