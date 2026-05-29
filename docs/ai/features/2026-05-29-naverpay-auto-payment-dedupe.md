# 네이버페이 자동결제 중복 방지 계획

## 요청

네이버페이 주문/자동결제 문자 예시:

`[Web발신] [네이버페이]자동결제안내 Goo… 'com.arlo…' 9,000원 http://naver.me/PayO`

앞으로 이 문자가 들어오면 기존 `네이버페이충전` 거래와 중복 집계하지 않고, 자동결제 문자에 적힌 구체적 금액을 기준으로 한 건만 가계부에 남긴다.

## 진단

- 현재 서버 인입 경로는 `api/_lib/auto-ingest.js` -> `api/_lib/server-parser.js`다.
- `server-parser.js`에는 카드 승인/은행 이체 deterministic parser만 있고, 네이버페이 자동결제 문자 전용 parser는 없다.
- `auto-ingest.js`의 중복 판정은 기본적으로 같은 `amount`, 같은 `type`, 같은 결제처/상대방을 요구한다.
- 네이버페이 충전 거래는 `네이버페이충전`으로, 자동결제 거래는 실제 상점/상품명으로 들어올 수 있어 현재 로직만으로는 중복 방지가 보장되지 않는다.
- 충전 금액이 자동결제 금액과 다를 가능성도 있어, 네이버페이 rail 전용 시간창 매칭이 필요하다.

## 결정

- 네이버페이 자동결제 문자는 deterministic parser로 먼저 처리한다.
- 자동결제 거래는 `card_payment`, `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 저장한다.
- 네이버페이 자동결제와 네이버페이 충전은 같은 시간창 안에서 같은 rail의 한 결제 사건으로 본다.
- 충전이 먼저 저장된 뒤 자동결제 문자가 들어오면 기존 충전 거래를 자동결제 정보로 보강하고 금액은 자동결제 문자 금액으로 맞춘다.
- 자동결제가 먼저 저장된 뒤 충전 문자가 들어오면 충전 raw만 기존 거래에 연결하고 새 거래는 만들지 않는다.

## 실행 슬라이스

### 슬라이스 1: 서버/브라우저 fallback 네이버페이 자동결제 파싱과 중복 매칭

범위:

- `utils/naverpay.js`
  - 네이버페이 자동결제 문자 파서
  - 네이버페이 충전/자동결제 거래 식별 helper
  - 충전 거래를 자동결제 거래로 보강하는 patch helper
- `api/_lib/server-parser.js`
  - LLM 호출 전 네이버페이 자동결제 deterministic parser 적용
- `api/_lib/auto-ingest.js`
  - parsed extra field 저장
  - 네이버페이 충전/자동결제 시간창 중복 매칭
  - 충전 선저장 시 자동결제 정보로 기존 거래 업데이트
- `client-parse.js`, `data.js`
  - 브라우저 fallback 경로에도 동일한 parser/중복 판정 적용

하지 않을 것:

- 기존 raw message 삭제
- Gemini/API secret 이동
- 카테고리 추천 범위 확장
- 과거 데이터 일괄 마이그레이션

검증:

- 네이버페이 자동결제 예시가 `amount: 9000`, `paymentRail: 'naverpay'`로 파싱되는지 확인한다.
- 자동결제와 `네이버페이충전`이 같은 시간창에 들어오면 한 거래로 연결되는지 단위 스모크로 확인한다.
- `node --check` 대상 파일을 확인한다.
- `npm.cmd run verify`와 `npm.cmd run pages:build`를 실행한다.

## 상태

- 계획 작성: 완료
- 실행: 완료
- 리뷰: 완료
