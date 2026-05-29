# 네이버페이 자동결제 중복 방지 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-05-29-naverpay-auto-payment-dedupe.md`
- 실행 슬라이스: 슬라이스 1 - 서버/브라우저 fallback 네이버페이 자동결제 파싱과 중복 매칭
- 변경 대상: `utils/naverpay.js`, `api/_lib/server-parser.js`, `api/_lib/auto-ingest.js`, `client-parse.js`, `data.js`, `app.js`, `index.html`

## 결과

코드상 차단 이슈는 발견하지 못했다.

## 확인 사항

- `[네이버페이]자동결제안내 ... 9,000원` 문자는 deterministic parser에서 `amount: 9000`, `merchant: "Goo… 'com.arlo…'"`, `paymentRail: 'naverpay'`, `paymentRailResolved: true`로 파싱된다.
- 네이버페이충전 거래와 자동결제 거래가 같은 시간창에 있으면 amount가 달라도 같은 rail 결제 pair로 인식된다.
- 충전 거래가 먼저 저장된 경우 자동결제 raw가 들어오면 기존 거래가 자동결제 정보로 보강되고 금액은 자동결제 문자 금액으로 교체된다.
- 자동결제 거래가 먼저 저장된 경우 충전 raw는 기존 거래에 연결되고 새 거래를 만들지 않는다.
- repo root에 `sw.js` 또는 `STATIC_ASSETS` 정의가 없어 `CACHE_VERSION` 갱신 대상은 없다.
- `data.js`는 앱 상태를 가진 싱글톤이라 일부 import에만 query string을 붙이면 모듈 인스턴스가 분리될 수 있다. 따라서 `app.js`의 `data.js` import는 기존 plain specifier를 유지했고, 직접 수정한 `client-parse.js`는 `app.js` import query로 캐시를 갱신했다.

## 검증

- `node --input-type=module -e "..."` 스모크: 네이버페이 자동결제 예시 파싱 및 충전/자동결제 pair/merge patch 확인 통과
- `node --check utils/naverpay.js`
- `node --check api/_lib/server-parser.js`
- `node --check api/_lib/auto-ingest.js`
- `node --check client-parse.js`
- `node --check data.js`
- `node --check app.js`
- `npm.cmd run verify` 통과
- `npm.cmd run pages:build` 통과
- `git diff --check` 통과
- 배포 확인: 커밋 `a4dcdcf` 기준 `Deploy GitHub Pages` workflow 성공, `https://aretenald2018-sys.github.io/budget/` HTTP 200, 배포본 `app.js?v=20260529-naverpay-dedupe` HTTP 200 및 `client-parse.js?v=20260529-naverpay-dedupe` 확인

## 남은 확인

- 실제 GitHub Actions `budget_ingest` 환경에서 새 문자와 충전 문자가 모두 들어왔을 때 Firestore에 raw 2개, transaction 1개로 연결되는지 배포 후 운영 데이터로 확인해야 한다.
