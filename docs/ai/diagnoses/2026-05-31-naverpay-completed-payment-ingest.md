# 네이버페이 결제완료 SMS 미등록 진단

## 요청

- Discord request: `devreq_discord_1510431709487697931`
- 증상: 첨부 화면의 `1588-3819` 발신 `[네이버페이]결제완료안내 ... 원 http://naver.me/PayO` SMS가 가계부 거래로 등록되지 않은 원인 파악

## 재현 루프

- 첨부 이미지 확인: `docs/ai/inbox/requests/devreq_discord_1510431709487697931/attachments/01-image0.jpg`
- 샘플 형식:
  - `[Web발신]`
  - `[네이버페이]결제완료안내 한국철... '철도승차권(한국...' 52,300원`
  - `http://naver.me/PayO`
- 로컬 스모크:
  - `parseNaverPayAutoPaymentMessage()`에 `결제완료안내` 샘플을 넣으면 `null`
  - `isNaverPayAutoPaymentMessage()`도 `false`

## 원인 가설 검증

1. `budget_ingest` GitHub Actions 경로가 누락됐다.
   - 반증: `.github/workflows/budget-backend.yml`의 `budget_ingest`는 `scripts/github-ingest.mjs`를 실행하고, 이 스크립트는 `normalizeIncomingPayload()` 뒤 `ingestAndParse()`를 호출한다.
2. SMS 본문 필드가 normalize되지 않는다.
   - 반증: `request-payload.js`는 `body`, `text`, `message`, `sms`, `notification_*` 계열을 본문으로 합친다. 첨부와 같은 본문 자체가 들어오면 raw 저장까지는 가능하다.
3. 네이버페이 전용 deterministic parser가 첨부 형식을 놓친다.
   - 확인: `utils/naverpay.js`는 `자동결제안내`만 매칭한다. 첨부의 `결제완료안내`는 전용 파서에서 제외된다.
4. 일반 Gemini parser가 대신 처리한다.
   - 불확실: 일반 parser 호출은 가능하지만 deterministic 보장이 없고, 실패하면 raw가 `pending` 또는 `skipped`로 남는다. 운영에서 등록 누락이 발생한 직접 원인은 전용 parser 범위 누락으로 보는 것이 가장 타당하다.

## 결론

첨부 경로의 SMS는 수집 경로 문제가 아니라 네이버페이 전용 parser의 문구 범위 문제다. 직전 작업은 `[네이버페이]자동결제안내` 예시에 맞춰 구현됐고, 실제로 들어온 `결제완료안내` 문구가 포함되지 않았다.

## 수정 방향

- `utils/naverpay.js`의 네이버페이 결제 안내 인식 범위를 `자동결제안내`와 `결제완료안내` 모두로 확장한다.
- 결제완료 문자를 `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 저장해 기존 네이버페이충전 중복 매칭을 그대로 타게 한다.
- 서버 ingest와 브라우저 fallback이 같은 helper를 쓰므로 동일 수정으로 두 경로를 같이 보정한다.
