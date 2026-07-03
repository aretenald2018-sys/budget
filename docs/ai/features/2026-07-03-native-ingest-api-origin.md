# Native ingest API origin canonicalization

## 배경

- 2026-07-03 KST 기준 실제 HTTP 확인 결과 `https://budget-snowy-iota.vercel.app/api/ingest`는 401 Unauthorized를 반환해 인증 게이트까지 살아 있다.
- 같은 시점 `https://budget-api-liart.vercel.app/api/ingest`, `/api/client-config`, `/api/client-parse`, `/api/sync-latest`는 404 Not Found를 반환한다.
- 현재 앱 코드 일부는 `liart`를 기본 API로 쓰고, 검증 스크립트는 반대로 `snowy`를 은퇴 도메인으로 막고 있어 native ingest와 브라우저 fallback API가 죽은 origin을 바라볼 수 있다.

## 목표

- 운영에서 응답하는 `snowy` origin을 앱의 canonical API origin으로 통일한다.
- 기존에 저장된 `liart` native ingest URL은 새 APK에서 자동으로 `snowy` ingest URL로 정규화한다.
- 검증 스크립트가 같은 회귀를 잡도록 `liart` ingest/API 기본값을 실패 조건으로 전환한다.

## 실행 슬라이스

1. `native-ingest-api-origin`
   - `config.js`, `index.html`, `render-settings.js`의 API 기본값을 `snowy`로 변경한다.
   - `android/src/com/aretenald/budget/NativeIngestStore.java`에서 빈 값 또는 `liart` 저장값을 `snowy` ingest URL로 정규화한다.
   - `scripts/verify-project.mjs`에서 `snowy` 금지 검사를 제거하고, 앱 코드의 `liart` API origin 잔존을 실패로 잡는다.
   - JS cache-busting query를 갱신한다.

## 제외

- 알림 파서 로직 추가 변경.
- Firestore raw/transaction 데이터 수정.
- Play Protect 정책 우회 또는 서명 체계 변경.

## 검증

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 가능하면 `npm.cmd run apk:build`
- 배포 후 GitHub Pages에서 새 `app.js` query, `config.js`, `render-settings.js`가 `snowy` origin을 포함하는지 확인한다.

## NEXT_ACTION.md 업데이트

- 상태: `ready_for_execution`
- 다음 실행 슬라이스: `native-ingest-api-origin`
