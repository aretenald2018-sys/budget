# Android 로컬 알림 수집 수동 실패 수정 실행

## 배경

- 진단 문서: `docs/ai/diagnoses/2026-07-03-android-local-notification-manual-fail.md`
- 기존 계획: `docs/ai/features/2026-07-03-android-local-notification-rebuild.md`
- 증상: 사용자가 실기기 수동 검증에서 Android 알림 수집이 전혀 동작하지 않는다고 보고했다.

## 실행 범위

- APK 알림 리스너가 실제 third-party 알림을 로컬 큐에 넣는지 검증 가능한 E2E 스크립트를 추가했다.
- `PaymentNotificationParser`의 결제 후보 필터와 SMS 승인 가맹점 추출을 보강했다.
- parser가 결제 가능성이 있는 알림을 버리는 경우 `ignored` 진단 row를 남기게 했다.
- 알림 접근 상태 판별을 component 표기 차이에 덜 민감하게 만들었다.
- APK 버전을 `2.0.6 / versionCode 7`로 올려 새 설치 여부를 명확하게 했다.

## 변경 파일

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
- `docs/ai/diagnoses/2026-07-03-android-local-notification-manual-fail.md`

## 검증 결과

1. `npm.cmd run verify:android-notification`
   - Android command-line tools, API 35 Google ATD system image, `BudgetNotifApi35` AVD를 사용했다.
   - 가계부 APK를 에뮬레이터에 설치하고 `BudgetNotificationService` 알림 접근을 허용했다.
   - 별도 `com.hanapay.notificationfixture` APK가 실제 알림을 게시했다.
   - 앱 private `SharedPreferences`에서 `queued`, `amount=2200`, `merchant=씨유문정엠스테이트점`, `source=android_local_notification` 캡처를 확인했다.
2. `npm.cmd run verify`
   - 통과: `verify-project passed (85 JS files checked).`
3. `npm.cmd run pages:build`
   - 통과: `_site` 생성 완료.

## 남은 검증

- Firestore 저장과 운영 GitHub Pages 배포는 아직 이번 수정 commit/push 전이므로 production에서는 not verified yet.
- 로그인된 실계정 WebView가 pending queue를 `saveTransaction`으로 저장해 캘린더에 표시하는 경로는 기존 JS smoke에서 검증되며, 실제 계정 쓰기는 운영 배포 후 확인해야 한다.
