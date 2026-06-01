# 네이버페이 결제완료 skipped raw 복구 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-06-01-naverpay-completed-skipped-reprocess.md`
- 진단 문서: `docs/ai/diagnoses/2026-06-01-naverpay-completed-skipped-reprocess.md`
- 실행 슬라이스: 슬라이스 1 - 네이버페이 결제완료 skipped raw 제한 복구
- 변경 대상: `api/_lib/auto-ingest.js`, `docs/ai/NEXT_ACTION.md`, 계획/진단 문서

## 리뷰 결과

차단 이슈 없음.

## 확인한 동작

- `processPendingStoredRawMessages()`는 기존 `pending` raw를 계속 처리한다.
- `status: 'skipped'` raw는 `parseNaverPayAutoPaymentMessage()`가 실제 네이버페이 결제 안내로 파싱할 수 있을 때만 재처리 대상이 된다.
- 일반 skipped raw는 재처리 대상에서 제외된다.
- 복구 대상 raw는 기존 저장/중복 매칭 경로를 그대로 사용하므로 성공 시 raw 상태가 `parsed`로 갱신되고, 네이버페이 충전 중복 매칭도 기존 로직을 탄다.

## 검증

- 요청 샘플 parser 스모크: `amount: 900`, `merchant: "티맵모… '[티맵 주차] …'"`, `paymentRail: 'naverpay'` 확인
- `parseRawMessage()` 스모크: 요청 샘플이 deterministic 결과로 반환되는지 확인
- 재처리 필터 스모크: `pending=true`, 네이버페이 `skipped=true`, 일반 `skipped=false` 확인
- `node --check api/_lib/auto-ingest.js`
- `node --check utils/naverpay.js`
- `npm.cmd run verify`
- `git diff --check`

## 남은 운영 확인

- 배포 후 `Budget Backend Jobs`의 주기 sync 또는 수동 `mode=sync` 실행에서 해당 skipped raw가 `parsed`로 바뀌고 거래 1건이 생성되는지 Firestore 운영 데이터로 확인한다.
