# Android 로컬 알림 수집 end-to-end 실행 기록

## 범위

- 계획: `docs/ai/features/2026-07-03-android-local-notification-rebuild.md`
- ADR: `docs/adr/2026-07-03-android-local-notification-ingest.md`
- 실행 범위: 슬라이스 2, 3, 4의 소스 구현을 한 번에 진행했다. 사용자가 "끝까지" 구현을 명시했기 때문에 새 Android 로컬 수집기, WebView bridge, Firestore 저장 연결, 설정 UI, APK cache bust를 같은 변경으로 묶었다.

## 구현 내용

- `android/AndroidManifest.xml`에 `BudgetNotificationService`를 `android.service.notification.NotificationListenerService`로 등록했다.
- 새 native 클래스 4개를 추가했다.
  - `BudgetNotificationService.java`: 알림 게시 이벤트 수신, 결제 후보 capture enqueue
  - `PaymentNotificationParser.java`: title/text/bigText/textLines/messages/ticker 기반 결제 후보 판별, 금액/가맹점/일시/type 추출
  - `NotificationCaptureStore.java`: Android private `SharedPreferences` 로컬 큐, pending 조회, saved/duplicate/fail ack, 상태 JSON
  - `BudgetAndroidBridge.java`: WebView `window.BudgetAndroid` bridge와 알림 접근 설정 이동
- `scripts/build-android-apk.mjs`의 generated `NativeHooks`가 `BudgetAndroidBridge`를 붙이도록 변경했다.
- `app.js`에서 로그인 이후 native pending capture를 즉시/30초 주기로 flush한다.
  - `findSimilarTransaction()`으로 10분 범위 중복을 확인한다.
  - 신규 거래는 `saveTransaction()`으로 저장한다.
  - 저장 또는 중복 ack 뒤 현재 탭이 `home`, `tx`, `report`, `review`이면 `refreshCurrentTab()`을 호출한다.
- `utils/android-capture.js`와 `utils/tx-calendar.js`를 추가해 Android capture -> transaction payload -> 거래 캘린더 daily amount/cell rendering 경로를 같은 순수 함수로 검증할 수 있게 했다.
- `render-settings.js`에 `Android 알림 수집` 패널을 추가했다.
  - 알림 접근 상태, queued/failed/saved/duplicate 개수, 최근 로그 표시
  - `알림 접근 열기`, `지금 반영` 버튼 제공
- `android/apk-version.json`을 `versionCode=6`, `versionName=2.0.5`, `cacheBust=20260703-android-local-notification-v6`로 올렸다.
- `scripts/build-pages.mjs`, `scripts/verify-project.mjs`, `package.json`에 stale APK metadata 방지 게이트를 추가했다. `public/downloads/budget-apk.json`이 `android/apk-version.json`과 맞지 않으면 Pages 빌드/검증/배포가 실패한다.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`, `docs/prd.md`의 "삭제된 상태" 설명을 현재 Android 로컬 수집 구조로 갱신했다.
- `scripts/verify-project.mjs`에 새 Android local notification 계약 검사를 추가했다.

## 검증

- 통과: `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; npm.cmd run apk:build`
  - 결과: `public/downloads/budget.apk` 25059 bytes, `versionName=2.0.5`, `versionCode=6`, signing mode `local-persistent`
- 통과: `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - 결과: `verify-project passed (84 JS files checked).`
  - 포함 검증: Android capture sample이 `android_local_notification` 거래 payload로 변환되고, 해당 거래가 2026-07-03 캘린더 daily amount `12,800` 및 `<em>-12,800</em>` 셀 렌더링으로 이어진다.
- 통과: `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 결과: `_site` artifact 생성 완료, `public/downloads/budget-apk.json`과 `_site/downloads/budget-apk.json` 모두 v2.0.5/6
- 통과: APK 서명 검증
  - 결과: v1/v2/v3 signature verified, signer 1
- 통과: APK manifest dump
  - 결과: `.BudgetNotificationService`, `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`, `android.service.notification.NotificationListenerService` 포함
- 통과: production deploy
  - 커밋: `e597bd4 Rebuild Android local notification capture`
  - GitHub Pages run: `28637241321`, build/deploy success
  - production APK metadata: `https://aretenald2018-sys.github.io/budget/downloads/budget-apk.json` HTTP 200, `versionName=2.0.5`, `versionCode=6`, `cacheBust=20260703-android-local-notification-v6`, signing mode `github-secret`
  - production `app.js`, `utils/android-capture.js`, `render-tx.js`, `utils/tx-calendar.js` HTTP 200 and include Android capture flush / calendar rendering code
  - production downloaded APK: 25059 bytes, manifest에 `.BudgetNotificationService`, `BIND_NOTIFICATION_LISTENER_SERVICE`, `NotificationListenerService` 포함

## 남은 확인

- 실제 Android 기기에서 APK 설치, 알림 접근 권한 허용, 결제 알림 수신, 앱 로그인 후 거래 탭 캘린더 반영을 확인해야 한다. 현재 `adb devices`에는 연결된 기기가 없고 AVD/system image도 없다.
