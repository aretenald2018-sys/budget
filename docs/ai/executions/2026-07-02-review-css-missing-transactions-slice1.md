# 2026-07-02 누락 거래 등록 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-02-review-css-missing-transactions.md`
- 실행 슬라이스: 슬라이스 1 - 2026-07-02 누락 거래 대조 및 등록
- CSS 수정은 이번 슬라이스에서 하지 않았다.

## 실행 내용

운영 GitHub Actions `Budget Backend Jobs`의 `workflow_dispatch` / `mode=ingest`를 사용해 Firestore 운영 데이터에 결제내역을 등록했다.

첫 dispatch는 `payload_json` quoting 문제로 Firestore까지 도달하지 못해 실패했다. 이후 `gh workflow run --json`으로 inputs를 stdin 전달하여 같은 9건을 정상 등록했다.

## 등록 결과

| 거래 | 금액 | txId | 상태 |
| --- | ---: | --- | --- |
| 배부른 감자탕 문정문점 | 11,000 | `bstdNGtuVHTI5LJGB3C5` | 등록 |
| 마인드풀 상담심리연구소 | 120,000 | `gufgjKsxcf9Gl3Hq4Fm3` | 등록 |
| 키오스크_나이스 | 1,440 | `0ER4Z6PNl3CJbu4NTEcK` | 등록 |
| 키오스크_나이스 | 1,280 | `xG1TdnWclUxCVRx6JRrL` | 등록 |
| 키오스크_나이스 | 1,120 | `JAiBmkO6vbiFbxYTtDJc` | 등록 |
| 쿠팡 쿠페이 | 113,000 | `nNdnmuXL9JmdpXX75TWd` | 등록 |
| 쿠팡 쿠페이 | 19,050 | `SYfcXoBf5ofuYJF03fXg` | 등록 |
| 티머니 | 55,000 | `hbIBsrkd5JF4ODVs3zgZ` | 등록 |
| 토스 김태우 토스증권 | 905,887 | `th9MgJLhSLJrRRHDu1HJ` | 등록, 예산 제외 |

`T맵주차`는 토스 화면에서 0원/취소선으로 표시되어 소비 거래로 만들지 않았다.

## 추가 보정: 2026-06-22 네이버페이충전

두 번째 첨부 화면의 `네이버페이충전` 2건은 이미 transaction 문서가 있었지만 merchant가 비어 있고 네이버페이 충전/이체성 제외 플래그가 없었다. 중복 생성하지 않고 기존 문서를 보정했다.

| 거래 | 금액 | txId | 보정 |
| --- | ---: | --- | --- |
| 네이버페이충전 06/22 17:09 | 30,000 | `NhDkF17oRPcxdpALNg5z` | merchant/counterparty 지정, `wallet_topup` 예산 제외 |
| 네이버페이충전 06/22 08:24 | 210,000 | `ssBGV3bQ87QqFNlUdZ9J` | merchant/counterparty 지정, `wallet_topup` 예산 제외 |

두 문서 모두 `needsReview: false`, `paymentRail: "naverpay"`, `paymentRailResolved: true`, `excludedFromBudget: true`, `excludeFromBudget: true`, `excludeReason: "wallet_topup"` 상태로 확인했다.

## 검증

- 운영 Actions 정상 등록 run:
  - `28559916615`
  - `28559918105`
  - `28559919938`
  - `28559921426`
  - `28559923081`
  - `28559924680`
  - `28559926533`
  - `28559928252`
  - `28559929861`
- 각 run 로그에서 `status: "parsed"`, `duplicateTx: false`, `txId` 생성을 확인했다.
- 로컬 `secrets/firebase-admin.json` + `.env.local`로 운영 Firestore를 읽어 9개 `txId`가 모두 존재함을 확인했다.
- 검증 결과:
  - missing: `0`
  - 예산 반영 대상 합계: `321,890원`
  - 토스증권 거래: `excludedFromBudget: true`, `excludeFromBudget: true`, `excludeReason: "self_transfer_toss_kim_taewoo"`

## 남은 일

- 슬라이스 2: 검토 탭 CSS 복구
- 리뷰 세션에서 중복 생성 여부, 토스증권 예산 제외, 7월 2일 운영 UI 반영을 확인한다.
