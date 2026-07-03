# Android 로컬 알림 수집 수동 실패 수정 리뷰

## 리뷰 대상

- `docs/ai/diagnoses/2026-07-03-android-local-notification-manual-fail.md`
- `docs/ai/executions/2026-07-03-android-local-notification-manual-fail-fix.md`
- `.gitignore`
- `android/apk-version.json`
- `android/src/com/aretenald/budget/BudgetNotificationService.java`
- `android/src/com/aretenald/budget/NotificationCaptureStore.java`
- `android/src/com/aretenald/budget/PaymentNotificationParser.java`
- `app.js`
- `index.html`
- `package.json`
- `render-settings.js`
- `scripts/verify-android-notification-e2e.mjs`

## 결과

문제 없음.

## 확인한 점

- Android E2E가 실제 별도 APK 알림을 발생시켜 `BudgetNotificationService`가 `queued` 캡처를 저장하는 경로를 검증한다.
- parser 후보 필터는 `결제/승인/출금/이체/입금/취소/환불` 또는 카드 사용 문맥을 강한 신호로 보며, 쿠폰/혜택류 오탐을 줄이도록 soft ignore를 유지한다.
- `ignored` 진단 row는 pending flush 대상이 아니므로 Firestore 저장 경로를 오염시키지 않는다.
- `versionCode 7`, `cacheBust v7`, `index.html -> app.js -> render-settings.js` cache-bust가 맞다.
- 기존 MacroDroid/Gemini/raw/backend ingest 경로를 되살리는 변경은 없다.

## 검증

- `npm.cmd run verify:android-notification` 통과.
- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.

## 남은 위험

- production GitHub Pages 배포 전까지 운영 APK 다운로드와 운영 UI는 not verified yet.
- 실제 사용자 계정으로 Firestore write와 거래 캘린더 표시까지 확인하려면 배포 후 APK v2.0.6 설치, 알림 접근 허용, 결제 알림 발생, 앱 로그인 상태 확인이 필요하다.
