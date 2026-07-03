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
- GitHub Pages run `28639987877` 성공.
- 운영 APK metadata/manifest v2.0.6 확인.
- 운영 설정 화면의 Android APK v2.0.6 링크 확인.
- 운영 거래 캘린더에서 `2026-07-03 -2,200원 / 씨유문정엠스테이트점` 표시 확인.

## 남은 위험

- Android 에뮬레이터 E2E는 native local queue까지 자동 검증한다.
- 실제 실기기에서 새 금융 앱 알림이 Firestore에 저장되는 최종 확인은 사용자의 기기 알림 접근 권한과 로그인 상태에 의존한다.
