# 금액 없는 raw 파싱 결과 거래 저장 방지 리뷰

## 리뷰 범위

- 계획: `docs/ai/features/2026-06-04-zero-amount-raw-skip.md`
- 변경 파일:
  - `api/_lib/auto-ingest.js`
  - `scripts/reprocess-pending-raw.mjs`
  - `docs/ai/features/2026-06-04-zero-amount-raw-skip.md`
  - `docs/ai/diagnoses/2026-06-04-toss-june3-discrepancy.md`
  - `docs/ai/NEXT_ACTION.md`

## 발견 이슈

### P1 - 브라우저 fallback raw 처리 경로가 아직 0원 거래를 저장할 수 있음

- 위치: `client-parse.js`
- 근거: 서버 `api/_lib/auto-ingest.js`와 `scripts/reprocess-pending-raw.mjs`에는 guard가 추가됐지만, `client-parse.js`는 여전히 `amount: Math.abs(Number(parsed.amount) || 0)`로 transaction payload를 만든다.
- 영향: 정적 호스트에서는 브라우저 pending raw parsing이 비활성화되어 있어 주 경로는 아니지만, fallback/manual parse가 실행되는 환경에서는 쿠팡 취소/환불 예정 같은 금액 없는 parsed 결과가 다시 `0원` 거래로 저장될 수 있다.
- 조치: focused fix에서 `client-parse.js`에 동일 기준의 skip guard를 추가하고, `app.js`의 `client-parse.js` import query를 갱신한다.
- 결과: 조치 완료. `client-parse.js`도 `parsedRawSkipReason()`/`parsedAmount()`를 사용하며, `app.js`와 `index.html` cache-bust를 갱신했다.

## 최종 리뷰 결과

- 차단 이슈 없음.
- 서버 즉시 ingest, 서버 pending raw 재처리, 브라우저 fallback 경로 모두 금액 없는 거래 타입 parsed 결과를 transaction 저장 전에 `skipped` 처리한다.
- `Math.abs(Number(parsed.amount) || 0)` 패턴은 raw parsed transaction 저장 경로에서 더 이상 검색되지 않는다.
- repo root에 `sw.js`/`STATIC_ASSETS`는 없어 `CACHE_VERSION` 갱신 대상은 없었다.

## 확인한 정상 동작

- 서버 즉시 ingest와 서버 pending raw 재처리 경로는 transaction 생성 전에 `parsedRawSkipReason()`을 호출한다.
- `card_payment amount: 0` 스모크는 skip reason을 반환하고, 정상 금액 결제는 skip하지 않는다.
- `node --check client-parse.js; node --check app.js; git diff --check` 통과.
- `npm.cmd run verify` 통과.
- `node scripts/export-calendar-csv.mjs 2026-06` 통과.

## 다음 상태

- 상태: `complete`
- 남은 작업: 배포 및 배포 확인.
