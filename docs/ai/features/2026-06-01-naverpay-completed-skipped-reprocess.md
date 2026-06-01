# 네이버페이 결제완료 skipped raw 복구 계획

## 배경

요청 샘플인 `[네이버페이]결제완료안내 티맵모… '[티맵 주차] …' 900원 http://naver.me/PayO`는 현재 parser에서 정상 파싱된다. 하지만 이전 배포 전 이미 `skipped`로 처리된 raw는 주기 재처리 대상이 아니므로 거래가 계속 생성되지 않을 수 있다.

## 그릴 결과

- 핵심 질문: skipped raw를 전부 다시 처리할 것인가?
- 결정: 아니다. deterministic parser로 네이버페이 결제 안내임이 확인되는 `skipped` raw만 복구 대상에 포함한다.
- 남은 가정: 문제 raw는 Firestore `users/{USER_UID}/raw_messages`에 남아 있으며 삭제되지 않았다.

## 슬라이스 1: 네이버페이 결제완료 skipped raw 제한 복구

### 범위

- `api/_lib/auto-ingest.js`
  - `processPendingStoredRawMessages()`가 최근 raw 중 `pending`과 함께 네이버페이 결제 안내로 판정되는 `skipped` raw를 처리하게 한다.
  - 일반 skipped raw는 재처리하지 않는다.
- `docs/ai/NEXT_ACTION.md`
  - 실행/리뷰 상태를 갱신한다.

### 제외

- Firestore raw 삭제 또는 임의 상태 초기화는 하지 않는다.
- Gemini prompt는 변경하지 않는다.
- 브라우저 UI와 cache-busting query는 변경하지 않는다.
- 운영 데이터를 직접 수정하는 일회성 스크립트 실행은 이 슬라이스에 포함하지 않는다.

### 검증

- 요청 샘플이 `parseNaverPayAutoPaymentMessage()`와 `parseRawMessage()`에서 `amount: 900`, `paymentRail: 'naverpay'`로 파싱되는지 확인한다.
- 재처리 대상 필터가 `pending` raw와 네이버페이 결제 안내 `skipped` raw를 포함하고, 일반 skipped raw는 제외하는지 확인한다.
- `node --check api/_lib/auto-ingest.js`
- `node --check utils/naverpay.js`
- `npm.cmd run verify`
- `git diff --check`

## 다음 실행 시작점

`docs/ai/features/2026-06-01-naverpay-completed-skipped-reprocess.md`의 슬라이스 1을 실행한다.

## 실행 결과

- `api/_lib/auto-ingest.js`의 `processPendingStoredRawMessages()` 재처리 대상이 `pending` raw와 네이버페이 결제 안내로 deterministic 파싱되는 `skipped` raw를 포함하도록 변경했다.
- 일반 `skipped` raw는 재처리하지 않는다.
- mailbox raw 보정 시 기존 raw 상태를 유지하고, 성공 시 기존 저장 경로가 `parsed`로 갱신한다.
- 검증:
  - 요청 샘플 parser 스모크: `amount: 900`, `merchant: "티맵모… '[티맵 주차] …'"`, `paymentRail: 'naverpay'`
  - `parseRawMessage()` 스모크: 요청 샘플을 Gemini 호출 없이 deterministic 결과로 반환
  - 재처리 필터 스모크: `pending=true`, 네이버페이 `skipped=true`, 일반 `skipped=false`
  - `node --check api/_lib/auto-ingest.js`
  - `node --check utils/naverpay.js`
  - `npm.cmd run verify`
  - `git diff --check`
