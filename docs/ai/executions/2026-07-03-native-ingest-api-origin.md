# Native ingest API origin canonicalization 실행

## 실행 내용

- 실제 HTTP 확인 결과를 기준으로 canonical API origin을 `https://budget-snowy-iota.vercel.app`로 통일했다.
- `config.js`와 `index.html`의 browser API base를 `snowy`로 변경했다.
- 설정 화면의 native ingest 기본 URL을 `https://budget-snowy-iota.vercel.app/api/ingest`로 변경했다.
- Android native ingest store에서 빈 URL 또는 기존 `https://budget-api-liart.vercel.app/api/ingest` 저장값을 `snowy` ingest URL로 정규화하게 했다.
- `scripts/verify-project.mjs`에서 `snowy` 금지 검사를 제거하고, browser code의 `liart` API origin 잔존을 실패로 잡게 했다.
- `index.html`, `app.js`, `utils/api-base.js` cache-busting query를 갱신했다.

## 검증

- HTTP endpoint 확인:
  - `https://budget-snowy-iota.vercel.app/api/ingest`: 401 Unauthorized
  - `https://budget-snowy-iota.vercel.app/api/client-config`: 200 OK
  - `https://budget-api-liart.vercel.app/api/ingest`: 404 Not Found
  - `https://budget-api-liart.vercel.app/api/client-config`: 404 Not Found
- `node --check scripts/verify-project.mjs`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `npm.cmd run apk:build`: not verified yet. 로컬 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 `ANDROID_HOME or ANDROID_SDK_ROOT is required to build the APK.`로 중단됐다.

## 주의

- 공개 Pages APK는 기존 이원화 정책대로 native ingest가 빠진 안전형 APK다.
- 앱 자체 notification ingest는 `npm.cmd run apk:build:native` 또는 `BUDGET_ANDROID_NATIVE_INGEST=true` 빌드에서 활성화된다.
- 이번 변경은 native ingest가 포함된 private APK variant의 서버 전송 URL을 바로잡는 수정이다.

## NEXT_ACTION.md 업데이트

- 상태: `ready_for_review`
- 리뷰 대상: 이번 실행 변경 파일 전체
