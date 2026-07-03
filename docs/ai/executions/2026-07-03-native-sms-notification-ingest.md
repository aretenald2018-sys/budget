# 네이티브 알림/SMS 병행 수집 실행

## 범위

사용자 요청에 따라 Android 알림 접근 기반 수집과 SMS 직접 수신을 병행하도록 구현했다.

## 변경

- `android/src/com/aretenald/budget/NativeIngestStore.java`
  - 기본 ingest endpoint를 `https://budget-api-liart.vercel.app/api/ingest`로 수정했다.
  - 폐기된 `budget-snowy-iota` endpoint는 저장값 마이그레이션 대상으로만 남기고, 빈 값/폐기 값은 현재 endpoint로 정규화한다.
- `android/src/com/aretenald/budget/BudgetSmsReceiver.java`
  - `SMS_RECEIVED` broadcast receiver를 추가했다.
  - 금융/결제 후보 SMS만 기존 native ingest queue로 넣는다.
  - 실제 카드사 문구 차이로 앱 안에서 조용히 버려지지 않도록 금액/결제/금융 키워드 조건을 완화했다.
  - manifest receiver가 반환된 뒤 프로세스가 정리되어 전송 스레드가 끊기는 경우를 줄이기 위해 `goAsync()`로 큐 저장/전송 완료까지 receiver를 붙잡는다.
  - 개인 문자 일반 본문은 큐에 저장하지 않는다.
- `android/src/com/aretenald/budget/NativeIngestClient.java`
  - payload에 `source`, `ingestChannel`, `ingestClient`를 추가했다.
  - 알림은 `native_notification / notification / android_notification_listener`, SMS는 `sms / sms / android_sms_receiver`로 구분한다.
  - SMS receiver에서 동기 전송할 수 있도록 `enqueueAndSendNow()`를 추가했다.
  - native 로그에도 channel/client 정보를 남긴다.
- `android/src/com/aretenald/budget/BudgetNotificationListener.java`
  - 알림 수집 필터도 SMS와 같은 방향으로 완화해 금융앱/문자앱 결제 알림이 raw까지 도달할 가능성을 높였다.
- `android/src/com/aretenald/budget/MainActivity.java`
  - WebView 설정 UI가 아직 배포되지 않아도 새 APK 실행 시 `RECEIVE_SMS` runtime permission을 직접 요청한다.
- `android/AndroidManifest.xml`
  - `RECEIVE_SMS` 권한과 `BudgetSmsReceiver`를 등록했다.
  - `android.hardware.telephony`는 optional feature로 선언했다.
  - notification listener service는 공식 예시와 맞춰 `exported=false`로 조정했다.
- `android/src/com/aretenald/budget/BudgetNativeBridge.java`
  - SMS 권한 상태를 WebView에 제공한다.
  - WebView에서 `RECEIVE_SMS` runtime permission을 요청할 수 있게 했다.
- `render-settings.js`, `app.js`, `index.html`
  - 설정 화면을 `Android 알림/SMS 수집`으로 확장했다.
  - 알림 접근 상태, SMS 권한 상태, token 상태를 함께 보여준다.
  - `SMS 권한 요청` 버튼을 추가했다.
  - APK 다운로드와 JS import cache-busting query를 갱신했다.
- `scripts/verify-project.mjs`
  - Android Java/XML까지 폐기 endpoint 검사를 확장했다.
  - SMS receiver, `RECEIVE_SMS`, `BROADCAST_SMS`, SMS 권한 UI, native endpoint 계약을 검증한다.
- `scripts/build-android-apk.mjs`, `.github/workflows/pages.yml`, `.gitignore`
  - APK가 빌드마다 새 서명키로 서명되어 업데이트 설치가 실패할 수 있던 구조를 고쳤다.
  - 로컬은 `.android-signing/budget-debug.keystore`, GitHub Actions는 `.android-signing` cache를 재사용한다.
  - APK `versionCode`/`versionName`을 `2026070302` / `2026.07.03.2`로 올렸다.

## 검증

- `node --check scripts/verify-project.mjs`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과
  - `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`: 통과
  - `_site` 생성 완료.
- `npm.cmd run apk:build`: 첫 실행은 `ANDROID_HOME or ANDROID_SDK_ROOT is required`로 실패.
- `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; npm.cmd run apk:build`: 통과
  - `public/downloads/budget.apk`
  - 크기: `25057` bytes
- 새 APK 생성 후 `npm.cmd run pages:build`: 통과
- 최종 `npm.cmd run verify`: 통과

## 미검증

- 실제 Android 기기에 새 APK를 설치해 SMS runtime permission, 알림 접근 권한, token 저장 후 결제 SMS/푸시가 `캡처됨 -> 전송됨 -> 거래 생성`으로 이어지는지는 아직 확인하지 못했다.
- 현재 worktree에 이번 작업 전부터 unrelated dirty/untracked 파일이 많아 production push/deploy는 수행하지 않았다.
