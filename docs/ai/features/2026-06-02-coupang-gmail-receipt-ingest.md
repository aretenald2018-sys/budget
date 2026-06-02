# 쿠팡 Gmail 영수증 미등록 보정 계획

## 배경

쿠팡 이메일 결제내역이 가계부에 저장되지 않는 사례가 반복된다. 로컬 스모크에서 `구매 상세내역 + 총 결제금액` 형식은 정상 파싱되지만, `주문이 완료되었습니다 + 결제금액` 또는 `결제 정보 + 결제금액` 형식은 deterministic parser를 통과하지 못하고 Gemini 호출로 떨어진다.

## `/diagnose`

- 재현 루프: `parseReceiptEmail()`에 쿠팡 이메일 샘플 3종을 직접 넣는다.
- 수정 전 결과:
  - 직접 구매 상세내역 메일: 파싱 성공.
  - 주문 완료/결제금액 메일: `GEMINI_API_KEY env 미설정`.
  - 결제 정보/결제금액 메일: `GEMINI_API_KEY env 미설정`.
- 원인: Gmail 검색 쿼리의 쿠팡 sender/키워드 범위와 쿠팡 deterministic parser의 결제 문구 범위가 실제 메일 변형보다 좁다.

## 슬라이스 1: 쿠팡 Gmail 수집/파싱 보강

### 범위

- `api/gmail-poll.js`
  - 쿠팡 공식 발신자 변형을 추가한다.
  - `구매하신 내역`, `주문 완료`, `주문이 완료되었습니다`, `쿠페이` 등 쿠팡 결제 메일 키워드를 검색 쿼리에 추가한다.
- `api/_lib/receipt-parser.js`
  - 쿠팡 직접 주문 메일 판정 문구에 주문 완료/결제 완료 계열을 추가한다.
  - 금액 추출 fallback에 `결제금액`을 추가한다.
  - 구매 상세 표가 없는 경우 `상품명` 또는 결제금액 주변의 상품명을 1개 품목으로 추출한다.

### 제외

- 운영 Gmail, Firestore 데이터를 직접 수정하거나 삭제하지 않는다.
- 쿠팡이츠, 배민, 카카오페이 parser는 변경하지 않는다.
- Gemini prompt는 이번 슬라이스에서 변경하지 않는다.
- 배포 자동화나 Secret 설정은 변경하지 않는다.

### 검증

- 수정 전 실패 샘플인 `주문이 완료되었습니다 + 결제금액 20,420원`이 Gemini 없이 `source: "coupang"`, `amount: 20420`, `skip: false`로 파싱된다.
- 수정 전 실패 샘플인 `결제 정보 + 결제금액 20,420원`이 Gemini 없이 파싱된다.
- 기존 `구매 상세내역 + 총 결제금액` 샘플이 계속 파싱된다.
- `node --check api/gmail-poll.js`
- `node --check api/_lib/receipt-parser.js`
- `npm.cmd run verify`
- `git diff --check`

## 다음 실행 시작점

`docs/ai/features/2026-06-02-coupang-gmail-receipt-ingest.md`의 슬라이스 1을 실행한다.

## 실행 결과

- `api/gmail-poll.js`의 Gmail 검색 범위에 쿠팡 발신자 변형 `no-reply@...`, `order@...`와 `구매하신 내역`, `주문 완료`, `주문이 완료되었습니다`, `결제 완료`, `쿠페이` 키워드를 추가했다.
- `api/_lib/receipt-parser.js`에서 쿠팡 직접 주문 메일이 `결제금액`만 포함해도 deterministic parser로 `source: "coupang"` 거래를 만들도록 보강했다.
- 구매 상세 표가 없는 쿠팡 메일은 `상품명`, `주문상품명`, `구매상품명` 또는 주문 완료 문구 뒤의 상품명을 1개 품목으로 보존한다. 상품명이 없으면 `결제금액` 같은 라벨을 품목명으로 오인하지 않고 빈 품목 배열로 둔다.
- 검증:
  - 수정 전 실패 샘플 `주문이 완료되었습니다 + 결제금액 20,420원` 파싱 통과
  - 수정 전 실패 샘플 `결제 정보 + 결제금액 20,420원` 파싱 통과
  - 기존 `구매 상세내역 + 총 결제금액 20,420원` 파싱 유지
  - 상품명 없는 `주문이 완료되었습니다 + 결제금액 20,420원`은 거래로 파싱하되 품목을 만들지 않음
  - `node --check api/gmail-poll.js`
  - `node --check api/_lib/receipt-parser.js`
  - `npm.cmd run verify`
  - `git diff --check`
