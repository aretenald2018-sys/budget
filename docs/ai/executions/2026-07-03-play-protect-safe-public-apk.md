# Play Protect 대응 공개 APK 실행

## 실행 내용

- 공개 기본 APK에서 `BudgetNotificationListener` service 선언을 제거했다.
- `scripts/build-android-apk.mjs`에 `BUDGET_ANDROID_NATIVE_INGEST` 빌드 옵션을 추가했다.
- 기본 빌드에서는 다음 native ingest Java 파일을 dex에서 제외한다.
  - `BudgetNativeBridge.java`
  - `BudgetNotificationListener.java`
  - `NativeIngestClient.java`
  - `NativeIngestStore.java`
- native ingest 옵션이 켜진 경우에만 build manifest에 notification listener service block을 삽입한다.
- 공개 APK에서 WebView `addJavascriptInterface` bridge 부착 코드를 제거했다.
- APK 버전을 `versionCode=3`, `versionName=2.0.2`로 올렸다.
- 설정 화면 버전/다운로드 링크를 `v2.0.2 · Play Protect 대응 공개 APK`와 `20260703-play-protect-safe-v3`로 갱신했다.
- Android 알림 수집 안내 문구를 공개 APK 기준으로 수정했다.

## 검증

- `node --check scripts/build-android-apk.mjs`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run apk:build`: 통과
  - `nativeIngest=false`
  - APK size 12772 bytes
- `aapt2 dump badging public/downloads/budget.apk` 확인:
  - package `com.aretenald.budget`
  - versionCode `3`
  - versionName `2.0.2`
  - permission `android.permission.INTERNET`만 표시
  - `notification-listener` component 없음
- `classes.dex` binary search 확인:
  - `BudgetNotificationListener` 없음
  - `NativeIngestClient` 없음
  - `NativeIngestStore` 없음
  - `BudgetNativeBridge` 없음
  - `NotificationListenerService` 없음
  - `addJavascriptInterface` 없음
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- signing certificate SHA-256:
  - `bf49ffeafd491e3e67aa3be8e0b7aff15f06b0b5931fb5b6840141836ebfba91`

## 주의

- 이 변경은 Play Protect 차단 가능성을 줄이는 앱 구조 변경이다. Google의 최종 판정은 서버/기기 정책에 달려 있어 100% 보장할 수 없다.
- 공개 APK는 앱 자체 notification ingest를 포함하지 않는다. 결제 알림 수집은 MacroDroid 경로가 기본이다.
