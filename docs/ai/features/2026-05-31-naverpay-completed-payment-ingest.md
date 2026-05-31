# 네이버페이 결제완료 SMS 등록 보정 계획

## 배경

첨부된 운영 SMS는 `1588-3819`에서 온 `[네이버페이]결제완료안내 ... 원 http://naver.me/PayO` 형식이다. 기존 네이버페이 보정은 `[네이버페이]자동결제안내 ... 원` 예시만 deterministic parser로 처리한다.

## 그릴 결과

- 핵심 질문: `결제완료안내`를 기존 네이버페이충전 중복 방지 rail에 포함할 것인가?
- 결정: 포함한다. 문구만 다를 뿐 네이버페이 rail의 실제 결제 내역이므로 `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 저장해야 기존 중복 매칭이 동작한다.
- 남은 가정: 운영 raw의 전체 본문은 첨부 화면처럼 금액과 가맹점 일부, `naver.me/PayO` 링크를 포함한다.

## 슬라이스 1: 네이버페이 결제완료 문구 deterministic parser 확장

### 범위

- `utils/naverpay.js`
  - `자동결제안내`와 `결제완료안내`를 모두 네이버페이 결제 안내로 인식한다.
  - merchant 추출 regex도 두 문구를 모두 지원한다.
  - 텍스트 기반 거래 식별 helper가 `결제완료안내` 본문도 네이버페이 결제 거래로 볼 수 있게 한다.
- 브라우저 캐시 갱신용 import query 업데이트
  - `client-parse.js`
  - `data.js`
  - `app.js`
  - `index.html`

### 제외

- 운영 Firestore raw를 직접 수정하거나 삭제하지 않는다.
- 기존 네이버페이충전 중복 매칭 알고리즘을 새로 설계하지 않는다.
- Gemini prompt 변경은 하지 않는다.

### 검증

- 수정 전 실패 샘플인 `결제완료안내`가 `amount: 52300`, `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 파싱되는지 확인한다.
- 기존 `자동결제안내` 샘플이 계속 파싱되는지 확인한다.
- 네이버페이충전 거래와 `결제완료안내` 거래가 같은 rail pair로 인식되는지 확인한다.
- `node --check` 및 `npm.cmd run verify`를 실행한다.
- 배포는 `main` push 후 GitHub Pages/Validate workflow 결과와 배포 URL HTTP 200으로 확인한다.

## 다음 실행 시작점

`docs/ai/features/2026-05-31-naverpay-completed-payment-ingest.md`의 슬라이스 1을 실행한다.

## 실행 결과

- `utils/naverpay.js`에서 `자동결제안내`와 `결제완료안내`를 모두 네이버페이 결제 안내로 인식하게 했다.
- 첨부 샘플 형식이 `amount: 52300`, `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 파싱되는 것을 확인했다.
- 기존 `자동결제안내` 샘플 파싱과 네이버페이충전 pair/merge patch 동작도 유지됨을 확인했다.
- 브라우저 fallback 캐시 갱신을 위해 `index.html`, `app.js`, `client-parse.js`, `data.js`의 관련 query string을 갱신했다.
- 검증:
  - `node --check utils/naverpay.js`
  - `node --check client-parse.js`
  - `node --check data.js`
  - `node --check app.js`
  - `node --check api/_lib/server-parser.js`
  - `node --check api/_lib/auto-ingest.js`
  - `npm.cmd run verify`
  - `git diff --check`
