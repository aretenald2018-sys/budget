# Android 로컬 알림 수집 재구축 실행 기록 - 슬라이스 1

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-android-local-notification-rebuild.md`
- ADR: `docs/adr/2026-07-03-android-local-notification-ingest.md`
- 실행 슬라이스: `레거시 수집 경로 전면 삭제`

## 수행 내용

- 휴대폰 알림 수집용 webhook/API 프록시, raw parser, browser fallback parser, GitHub ingest/reprocess 스크립트, Android SMS/알림 HTTP 전송 클래스를 삭제했다.
- `app.js` 자동 실행 경로에서 browser fallback raw parsing을 제거하고 Gmail sync만 남겼다.
- `render-settings.js`에서 browser fallback parse, Android token/API URL, 큐 재전송, ingest trace UI를 제거했다.
- `data.js`에는 과거 raw review용 pending 조회/skip만 남기고 신규 raw 생성, parsed 마킹, mailbox raw API를 제거했다.
- `.github/workflows/budget-backend.yml`은 Gmail sync와 recipe job만 운영하도록 정리했다.
- `scripts/build-android-apk.mjs`는 기본 WebView APK 빌드만 남기고 native ingest variant를 제거했다.
- `scripts/verify-project.mjs`는 삭제 파일/금지 토큰이 runtime/source에 남으면 실패하도록 갱신했다.
- source 문서와 mockup의 과거 수집 안내를 현행 구조로 정리했다.

## 삭제 파일

- `client-parse.js`
- `api/ingest.js`, `api/ingest/sms.js`, `api/ingest/notif.js`
- `api/client-config.js`, `api/client-parse.js`
- `api/_lib/auto-ingest.js`, `api/_lib/server-parser.js`, `api/_lib/request-payload.js`, `api/_lib/firestore-rest.js`, `api/_lib/auth.js`
- `scripts/github-ingest.mjs`, `scripts/reprocess-pending-raw.mjs`, `scripts/link-duplicate-raw.mjs`
- `android/src/com/aretenald/budget/BudgetNativeBridge.java`, `BudgetNotificationListener.java`, `BudgetSmsReceiver.java`, `NativeIngestClient.java`, `NativeIngestStore.java`

## 검증

- `npm.cmd run verify` 통과: `verify-project passed (82 JS files checked).`
- `npm.cmd run pages:build` 통과: `_site` Pages artifact 생성.
- runtime/source와 `_site`에서 삭제 대상 문자열을 검색했고, `scripts/verify-project.mjs`의 금지 목록 외 운영 참조는 발견되지 않았다.

## 남은 일

- 새 Android 알림 수집기는 아직 구현하지 않았다. 다음 실행 대상은 슬라이스 2 `Android 알림 로컬 캡처 구현`이다.
- production deploy는 수행하지 않았다. 현재 worktree에 기존 unrelated dirty/untracked 변경이 많아 의도 변경만 커밋/푸시하기 전까지 production UI 검증은 `not verified yet`이다.
