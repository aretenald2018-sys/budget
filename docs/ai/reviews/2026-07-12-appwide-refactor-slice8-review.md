# 앱 전체 리팩토링 슬라이스 8 리뷰

## 결론

- 슬라이스 8과 앱 전체 리팩토링 슬라이스 0~8을 완료했다. `release.json`이 앱 entry, 주요 모듈, CSS, Android APK의 릴리스·캐시 계약을 한곳에서 추적한다.
- Pages build는 공개 산출물 allowlist와 서버/개발 디렉터리 denylist를 함께 검증한다. 중복 APK 경로와 비공개 소스가 `_site`에 들어오면 빌드가 실패한다.
- 전체 테스트, verifier, recipe 검사, Pages build, GitHub Pages 배포와 로그인된 production smoke를 통과했다.

## 변경 경계

- `release.json`: `20260712-appwide-refactor-r1` 릴리스 ID와 app/data/modal/reward/news/Telegram/Android 캐시 버전을 선언한다.
- `scripts/verify/config.mjs`: verifier가 별도 상수를 중복 선언하지 않고 release manifest를 읽는다.
- `scripts/build-pages.mjs`: release schema와 `index.html` query-string을 검사하고, `_site` 최상위 공개 산출물과 금지 경로를 빌드 전후로 검증한다.
- `test/release-contract.test.mjs`: manifest schema, entry query, APK metadata, Pages allowlist 계약을 회귀 테스트로 고정한다.
- `index.html`: 앱 entry와 CSS에 `release=20260712-appwide-refactor-r1`을 포함한다.
- `docs/ARCHITECTURE.md`, `docs/deployment.md`, `docs/refactor-smoke-matrix.md`: 릴리스 소유권, Pages 산출물 경계, 전체 smoke 기준을 현재 구조에 맞췄다.

## 검증

- `npm.cmd test`: 62/62 통과.
- `npm.cmd run verify`: 통과, 168개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run verify:registered-recipes`: 9개 등록 레시피 검사 완료.
- `npm.cmd run pages:build`: `_site` 생성과 공개 산출물 allowlist 검사 통과. `_site/public/downloads`와 `_site/public/android-apk.svg` 중복 경로는 없고 `release.json`과 root APK/metadata만 공개됐다.
- GitHub Pages workflow [29190304664](https://github.com/aretenald2018-sys/budget/actions/runs/29190304664): build 1분 7초, deploy 10초로 성공했다. Node.js 20 deprecation annotation은 강제 Node.js 24 전환 안내이며 실패가 아니다.
- production에서 `release.json`, release query가 붙은 `app.js`/`style.css`, `downloads/budget-apk.json`은 HTTP 200이었다. `scripts/build-pages.mjs`와 중복 경로 `public/downloads/budget.apk`는 HTTP 404였다.
- 로그인된 production에서 홈 실데이터, 카테고리 drill-down modal, 뉴스피드, 재무 목표/시나리오, 거래 달력과 거래 상세 취소, 검토 대기 안내, 설정, 월간 리포트, 정산 흐름을 실제로 열어 확인했다. 저장이나 사용자 데이터 변경은 수행하지 않았다.
- 최신 릴리스 query로 다시 로드한 DOM에서 `app.js`와 `style.css`의 `release=20260712-appwide-refactor-r1`을 확인했다.
- 360px viewport에서 body/document 폭 350px, viewport 360px, 수평 overflow 후보 0건이었다. console warning/error는 0건이고 modal load 정보 로그만 있었다.

## 외부 확인이 남은 항목

- Vercel production `GET /api/product-preview`는 404이므로 해당 endpoint의 외부 서버 배포는 `not verified yet`이다. 로컬 fake adapter handler test와 Pages 경계는 통과했다.
- 물리 Android 기기의 실제 결제 알림 → 앱 로그인 → Firestore 저장 → 거래 화면 표시 전 과정은 `not verified yet`이다. 연결된 물리 기기와 실제 결제 알림이 없는 것이 제한이며 emulator queue E2E와 Web fake bridge 계약은 통과했다.

## 커밋

- `c023a97` Centralize release and Pages artifact contracts

## 최종 상태

- 리팩토링 계획의 구조 변경과 회귀 감사는 완료했다. 이후 작업은 위 두 외부 배포·실기기 확인으로 분리한다.
