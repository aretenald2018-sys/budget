# 하나Pay 결제 알림 parser 보강 실행

## 변경

- `api/_lib/server-parser.js`
  - `parseKoreanCardPaymentNotice()` 추가.
  - `(결제|취소|환불) 금액 가맹점 / 신용|체크|일시불|할부 / MM.DD HH:mm` 형식을 `card_payment`로 변환.
- `scripts/verify-project.mjs`
  - 하나Pay 첨부 샘플 parser smoke test 추가.
- `api/_lib/auto-ingest.js`
  - deterministic parser는 Firestore `accounts/categories` read 전에 먼저 실행하도록 변경.
  - Firestore read quota로 부가 enrichment 또는 duplicate lookup이 실패하면 `ingestWarnings`/`duplicateCheckSkipped`를 남기고 최소 거래를 저장하는 fallback 추가.

## 로컬 검증

- 샘플 파싱 결과:
  - `type=card_payment`
  - `amount=2200`
  - `merchant=씨유문정엠스테이트점`
  - `occurredAt=2026-07-03T08:40:00+09:00`
- `node --check api/_lib/server-parser.js` 통과.
- `node --check scripts/verify-project.mjs` 통과.
- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.

## 남은 검증

- main push 후 Pages/backend workflow 성공 확인.
- 운영 workflow_dispatch ingest로 누락 건 등록 확인.
