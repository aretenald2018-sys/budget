# S24 카드 승인 SMS 미인입 실행

## 변경

- `android/src/com/aretenald/budget/BudgetNotificationService.java`
  - `BudgetNotifSvc` logcat 로그를 추가했다.
  - `onListenerConnected`에서 `getActiveNotifications()`를 재스캔해 현재 알림창에 남은 결제 알림도 큐에 넣게 했다.
  - 수집 성공, 파서 무시, 예외, 활성 알림 스캔 요약을 릴리즈 APK에서도 ADB logcat으로 볼 수 있게 했다.
- `android/src/com/aretenald/budget/PaymentNotificationParser.java`
  - `samsung`을 금융 앱 힌트에서 제거했다.
  - `messaging`, `message`, `sms`, `mms`, `문자`, `메시지` 힌트를 추가해 문자 앱의 승인/결제 SMS를 명시적으로 처리한다.
- `scripts/verify-android-notification-e2e.mjs`
  - S24에서 확인한 하나카드 승인 SMS 본문을 fixture 알림으로 추가했다.
  - S24와 에뮬레이터가 동시에 연결되어도 에뮬레이터 serial을 지정해 E2E가 실패하지 않게 했다.
- `scripts/verify-project.mjs`
  - 활성 알림 재스캔, logcat 태그, SMS 힌트가 빠지면 검증이 실패하게 했다.
- `android/apk-version.json`, `render-settings.js`, `app.js`, `index.html`
  - APK 버전을 `v2.0.7`, `versionCode=8`, cache bust `20260703-android-local-notification-v8`로 올렸다.

## 로컬 검증

- `npm.cmd run verify:android-notification`
  - 에뮬레이터에 새 APK를 설치하고 fixture 결제 알림 2건을 발행했다.
  - 일반 하나Pay 알림과 S24 SMS 본문 모두 로컬 큐에 들어감을 확인했다.
- `npm.cmd run verify`
  - `verify-project passed (85 JS files checked).`
- `npm.cmd run pages:build`
  - `_site` Pages artifact 생성 완료.

## 남은 검증

- GitHub Pages에서 secret 서명으로 v2.0.7 APK가 배포된 뒤 S24에 설치한다.
- S24에서 리스너를 재연결하고 `adb logcat -s BudgetNotifSvc:*`에 `active_scan`과 `queued amount=11000 merchant=뼈우림감자탕문정`이 찍히는지 확인한다.
- 앱이 로그인된 상태로 열려 있으면 WebView flush 후 거래/캘린더 반영까지 확인한다.
