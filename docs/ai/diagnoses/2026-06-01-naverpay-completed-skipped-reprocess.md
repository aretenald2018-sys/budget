# 네이버페이 결제완료 SMS skipped raw 복구 진단

## 요청

- Discord request: `devreq_discord_1510801802621223003`
- 증상: `[네이버페이]결제완료안내 티맵모… '[티맵 주차] …' 900원 http://naver.me/PayO` 문자가 가계부에 잡히지 않음

## 재현 루프

- 현재 코드의 `parseNaverPayAutoPaymentMessage()`에 요청 샘플을 직접 넣어 확인한다.
- 기대 결과:
  - `type: 'card_payment'`
  - `amount: 900`
  - `merchant: "티맵모… '[티맵 주차] …'"`
  - `paymentRail: 'naverpay'`
  - `paymentRailResolved: true`

## 확인 결과

- 현재 HEAD의 deterministic parser는 요청 샘플을 정상 파싱한다.
- 즉, 새로 들어오는 같은 형식의 `budget_ingest` 이벤트는 `api/_lib/auto-ingest.js`의 즉시 파싱 경로에서 거래로 저장될 수 있다.
- 다만 이전 배포 전 또는 Gemini 실패 중 들어와 `status: 'skipped'`가 된 raw는 `processPendingStoredRawMessages()`의 재처리 대상이 아니다.
- 이 경우 코드가 수정되어도 기존 raw는 계속 skipped 상태라 가계부 거래가 만들어지지 않는다.

## 원인 가설 검증

1. 새 deterministic parser가 티맵 주차 샘플을 놓친다.
   - 반증: 로컬 스모크에서 요청 샘플은 `amount: 900`, `paymentRail: 'naverpay'`로 파싱된다.
2. GitHub Actions 인입 경로가 다른 parser를 쓴다.
   - 반증: `.github/workflows/budget-backend.yml`의 `budget_ingest`는 `scripts/github-ingest.mjs`를 실행하고, 이는 `ingestAndParse()` -> `parseRawMessage()` -> `parseNaverPayAutoPaymentMessage()` 경로를 탄다.
3. 이미 `skipped` 처리된 raw가 재처리되지 않는다.
   - 확인: `processPendingStoredRawMessages()`는 `status === 'pending'`만 처리한다. 결제완료 parser 추가 전 skip된 raw는 그대로 남는다.

## 결론

요청 샘플 자체는 현재 parser로 처리 가능하다. 실제 누락 가능성이 큰 경로는 기존에 `skipped`로 확정된 네이버페이 결제완료 raw가 자동 복구되지 않는 점이다.

## 수정 방향

- `processPendingStoredRawMessages()`에서 `pending` raw 외에 deterministic parser로 네이버페이 결제 안내임이 확인되는 `skipped` raw도 제한적으로 복구 처리한다.
- 일반 skipped raw 전체를 다시 열지 않는다.
- 재처리 결과는 기존과 같이 raw 상태를 `parsed`로 변경하고 거래를 생성하거나 중복 거래에 연결한다.
