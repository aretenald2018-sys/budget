# 앱 전체 리팩토링 슬라이스 6 리뷰

## 결론

- 슬라이스 6 완료. Gmail receipt sync, 상품 미리보기, 이미지 검색, 레시피 분석, Telegram 공개 피드의 HTTP/use case/외부 adapter/저장 경계를 분리했다.
- handler는 요청·응답과 메서드 계약만 담당하고, service는 fake adapter로 외부 네트워크 없이 단위 테스트할 수 있다.
- 서버 환경 변수, timeout JSON fetch, transient retry 정책을 공통 모듈로 고정했다. 기존 secret 이름, Actions schedule, 사용자 범위는 바꾸지 않았다.
- 슬라이스 7 Android 수집 경계와 계약 강화로 진행할 수 있다.

## 변경 경계

- `api/services/gmail-receipt-sync.js`, `api/adapters/gmail.js`, `api/adapters/gmail-poll-state.js`, `api/adapters/receipt-processing.js`: Gmail polling, receipt 처리, poll cursor 저장을 분리했다.
- `api/services/product-preview.js`, `api/adapters/product-preview.js`, `api/product-preview.js`: 상품 미리보기 provider와 얇은 HTTP handler를 분리했다.
- `api/services/visual-search.js`, `api/adapters/visual-search.js`, `api/visual-search.js`: provider fallback과 검색 결과 정규화를 service/adapter로 이동했다.
- `api/adapters/recipe-analysis-store.js`, `api/_lib/recipe-analysis.js`: 레시피 분석 저장과 preview 의존성을 주입 가능하게 바꿨다.
- `api/adapters/telegram-feed-state.js`, `api/_lib/telegram-public-feed.js`: Telegram feed 상태 저장을 Firestore 구현에서 분리했다.
- `api/_lib/env.js`, `api/_lib/upstream.js`, `api/_lib/http.js`: 환경 변수 alias/필수값, timeout/retry, CORS/method/error 응답을 공통화했다.
- `api/_lib/firebase-admin.js`는 기존 서버 데이터·인증 경계로 유지했다.

## 계약과 회귀 방지

- Gmail service는 Firestore, `fetch`, `process.env`에 직접 의존하지 않는다.
- product/visual handler는 service에 위임하며 handler 크기 제한을 verifier가 검사한다.
- recipe/Telegram service는 Firestore를 직접 import하지 않는다.
- Gemini/Groq/Gmail upstream은 공통 env/timeout 정책을 사용한다.
- Gmail replay는 이미 처리한 메시지를 건너뛰며, 개별 메시지 실패가 나머지 batch를 중단하지 않는다.
- 서버 소유권 검사는 `scripts/verify/checks/domain-checks.mjs`에 포함돼 경계 역행을 실패시킨다.

## 검증

- `npm.cmd test`: 55/55 통과.
- `npm.cmd run verify`: 통과, 166개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run verify:registered-recipes`: 9개 등록 레시피 검사 완료.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- GitHub Pages workflow [29189664081](https://github.com/aretenald2018-sys/budget/actions/runs/29189664081): build/deploy 성공. Node.js 20 deprecation annotation은 Actions runtime 안내이며 실패가 아니다.
- Vercel production `GET /api/visual-search`의 빈 query가 400 JSON `q 필요` 계약을 반환했다.
- Vercel production `GET /api/product-preview`는 404를 반환했다. 따라서 이 endpoint의 외부 서버 배포는 `not verified yet`; 현재 Vercel 배포에 해당 route가 없는 것이 정확한 차단 사유다. 로컬 fake adapter handler test와 Pages 배포는 통과했다.
- Actions 수동 dispatch는 실제 사용자 데이터를 변경할 수 있어 실행하지 않았다. fake adapter 기반 replay/idempotency test로 service 계약을 검증했다.

## 커밋

- `154988c` Extract Gmail receipt sync service
- `f729117` Extract product preview endpoint service
- `6b24b4f` Add server runtime policies
- `3fb6c9c` Extract Telegram feed state adapter
- `a7073a4` Extract visual search adapter
- `7c5469c` Extract recipe analysis store adapter
- `f17da19` Enforce server service ownership

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 7에서 Android capture payload schema/version, parser fixture, queue ack/retry/dedupe, 로그인 전후 flush, Web/Java widget snapshot parity를 고정한다.
