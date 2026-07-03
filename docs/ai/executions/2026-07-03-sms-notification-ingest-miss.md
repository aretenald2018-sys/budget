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

## 실기기/production 검증

- GitHub Pages workflow `28641297093` 성공.
- production APK metadata:
  - `versionCode`: `8`
  - `versionName`: `2.0.7`
  - `signing.mode`: `github-secret`
- S24 Ultra에 production APK v2.0.7을 `adb install -r`로 설치 완료.
- S24 리스너 재연결 후 `adb logcat -s BudgetNotifSvc:*`에서 확인:
  - `queued reason=active:listener_connected amount=11000 merchant=뼈우림감자탕문정 package=com.samsung.android.messaging`
  - `active_scan reason=listener_connected scanned=14 queued=1`
- 앱 잠금해제 후 거래 화면에서 확인:
  - `2026-07-01 / 뼈우림감자탕문정 / -11,000원`
  - 2026년 7월 캘린더와 2026-07-01 일자 합계에 반영됨.
