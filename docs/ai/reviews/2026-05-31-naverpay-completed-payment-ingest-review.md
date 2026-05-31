# 네이버페이 결제완료 SMS 등록 보정 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-05-31-naverpay-completed-payment-ingest.md`
- 진단 문서: `docs/ai/diagnoses/2026-05-31-naverpay-completed-payment-ingest.md`
- 실행 슬라이스: 슬라이스 1 - 네이버페이 결제완료 문구 deterministic parser 확장
- 변경 대상: `utils/naverpay.js`, `client-parse.js`, `data.js`, `app.js`, `index.html`, `docs/ai/NEXT_ACTION.md`

## 리뷰 결과

차단 이슈 없음.

## 확인한 동작

- `utils/naverpay.js`는 `[네이버페이]자동결제안내`와 `[네이버페이]결제완료안내`를 모두 네이버페이 결제 안내로 인식한다.
- 첨부와 같은 `결제완료안내` 샘플은 `amount: 52300`, `merchant: "한국철... '철도승차권(한국...'"`, `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 파싱된다.
- 기존 `자동결제안내` 샘플은 `amount: 9000`, `paymentRail: 'naverpay'`로 계속 파싱된다.
- 네이버페이충전 거래와 결제완료 거래는 기존 rail pair 로직에서 같은 결제 사건으로 인식된다.
- 서버 `parseRawMessage()` 경로도 결제완료 샘플을 Gemini 호출 없이 deterministic 결과로 반환한다.

## 검증

- `node --input-type=module -e "..."` 스모크: 결제완료/자동결제 샘플 파싱 및 충전 pair/merge patch 확인 통과
- `node --input-type=module -e "..."` 스모크: `api/_lib/server-parser.js`의 `parseRawMessage()` 결제완료 샘플 파싱 확인 통과
- `node --check utils/naverpay.js`
- `node --check client-parse.js`
- `node --check data.js`
- `node --check app.js`
- `node --check api/_lib/server-parser.js`
- `node --check api/_lib/auto-ingest.js`
- `npm.cmd run verify`
- `git diff --check`

## 남은 운영 확인

- 배포 후 새 `budget_ingest` 운영 이벤트가 들어오면 raw 상태가 `parsed`가 되고 거래 1건으로 연결되는지 Firestore 운영 데이터에서 확인한다.
