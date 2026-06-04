# 금액 없는 raw 파싱 결과 거래 저장 방지

## 배경

Toss 2026-06-03 차이 진단 중 쿠팡 "주문 취소/환불 예정" 알림이 결제 금액 없이 `card_payment`, `amount: 0` 거래로 저장된 것을 확인했다. 이 거래는 지출 합계를 직접 늘리지는 않지만, 거래 목록과 검토 대기를 오염시키고 이후 정밀 대조를 어렵게 만든다.

## 목표

- `card_payment`, `transfer_out`, `transfer_in`, `settlement_in`, `settlement_out` 파싱 결과가 금액 0 또는 비정상 금액이면 transaction을 만들지 않는다.
- 해당 raw 메시지는 삭제하지 않고 `skipped` 상태와 명확한 `skipReason`으로 남긴다.
- 즉시 ingest 경로와 pending raw 재처리 경로가 같은 기준을 사용하게 한다.

## 비목표

- raw에 없는 Toss 쿠팡 결제 2건(`11,460`, `10,890`)을 임의 생성하지 않는다.
- 기존 `amount: 0` 운영 transaction을 자동 삭제하거나 수정하지 않는다.
- MacroDroid/알림 권한/카드사 수집 설정은 이번 슬라이스에서 변경하지 않는다.

## 실행 슬라이스

### 슬라이스 1 - 금액 없는 parsed 거래 skip 처리

예상 변경 파일:

- `api/_lib/auto-ingest.js`
- `client-parse.js`
- `app.js`
- `index.html`
- `scripts/reprocess-pending-raw.mjs`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/reviews/2026-06-04-zero-amount-raw-skip-review.md`

작업:

1. 서버 ingest에서 parsed 결과가 거래 타입이지만 `amount <= 0`이면 transaction 저장 전에 raw를 `skipped`로 갱신한다.
2. pending raw 재처리 스크립트에도 동일한 guard를 적용한다.
3. 쿠팡 취소/환불 예정처럼 결제 금액이 없는 알림을 재현하는 parser/ingest 스모크를 실행한다.

검증:

- `npm.cmd run verify`
- `node scripts/export-calendar-csv.mjs 2026-06`
- 금액 없는 쿠팡 취소 raw 샘플이 새 transaction 생성 대상이 아니라 `skipped` 대상임을 로컬 스모크로 확인한다.

## 다음 세션 프롬프트

`docs/ai/features/2026-06-04-zero-amount-raw-skip.md`의 슬라이스 1만 실행하라. raw 삭제나 누락 결제 임의 생성은 하지 말고, 금액 없는 parsed 거래가 transaction으로 저장되지 않도록 guard를 추가한 뒤 검증과 리뷰 문서를 남겨라.

## 실행 결과

### 슬라이스 1 - 금액 없는 parsed 거래 skip 처리

상태: 완료

변경:

- `api/_lib/auto-ingest.js`에 `parsedRawSkipReason()`/`parsedAmount()`를 추가하고 즉시 ingest 및 pending raw 재처리 경로에서 공통으로 사용했다.
- `scripts/reprocess-pending-raw.mjs`도 같은 helper를 사용해 금액 없는 parsed 거래를 transaction으로 만들지 않고 raw `skipped`로 남기게 했다.
- 리뷰에서 발견한 브라우저 fallback 누락을 `client-parse.js`에 같은 기준으로 보강했다.
- `app.js`의 `client-parse.js` import query와 `index.html`의 `app.js` query를 `20260604-zero-amount-skip`으로 갱신했다.
- raw 삭제, 누락 쿠팡 결제 임의 생성, 기존 운영 `0원` transaction 자동 수정은 하지 않았다.

검증:

- `node --input-type=module -e "...parsedRawSkipReason smoke..."`: `card_payment amount: 0`은 `금액 없는 거래 파싱 결과...`로 skip, `card_payment amount: 11900`은 skip 없음.
- `node --check client-parse.js; node --check app.js; git diff --check`: 통과.
- `npm.cmd run verify`: `verify-project passed (95 JS files checked).`
- `node scripts/export-calendar-csv.mjs 2026-06`: `transactions: 17`, `rows: 25`.
