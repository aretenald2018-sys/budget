# Android 자체 수집과 경로 추적성 보강 계획

## 요청

앱이 Android 모바일 결제내역(문자, 은행앱 알림 등)을 MacroDroid 없이 ingest 할 수 있는지 다시 검증하고, 앞으로 MacroDroid 수집인지 앱 자체 파이프라인 수집인지 추적/점검할 수 있게 한다.

## 그릴 결과

- 핵심 질문: 웹앱만으로 Android 타 앱 알림을 읽을 수 있는가?
- 답: 불가능하다. Android `NotificationListenerService`가 필요하다.
- 결정: 기존 WebView APK에 native notification listener를 붙이고, 정적 웹앱 설정 화면은 native bridge가 있을 때만 토큰 저장/권한 열기/큐 재전송을 수행한다.
- 결정: `INGEST_TOKEN`은 browser JS/localStorage/APK source에 넣지 않고, 사용자가 APK 안에서 입력한 값을 Android private storage에만 저장한다.
- 결정: MacroDroid는 즉시 제거하지 않고, raw/transaction에 남는 `ingestOrigin`으로 병행 기간을 점검한다.

## 실행 슬라이스

### 슬라이스 1: native 수집기와 추적 표식

- 상태: 완료
- 파일:
  - `android/AndroidManifest.xml`
  - `android/res/values/strings.xml`
  - `android/src/com/aretenald/budget/MainActivity.java`
  - `android/src/com/aretenald/budget/BudgetNotificationListener.java`
  - `android/src/com/aretenald/budget/BudgetNativeBridge.java`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
  - `android/src/com/aretenald/budget/NativeIngestStore.java`
  - `api/_lib/request-payload.js`
  - `api/_lib/auto-ingest.js`
  - `render-settings.js`
  - `scripts/build-android-apk.mjs`
  - `app.js`
  - `index.html`
- 구현:
  - APK에 `NotificationListenerService` 등록.
  - 결제 후보 알림을 `/api/ingest`로 전송하고 실패 시 private storage 큐에 보관.
  - 서버 normalize에서 incoming `meta` 보존.
  - raw/transaction에 `ingestOrigin`, `ingestChannel`, `ingestClient`, `ingest` 저장.
  - 설정 화면에 `수집 경로 점검`과 `Android 알림 수집` 패널 추가.
- 제외:
  - MacroDroid 매크로 삭제.
  - 기존 Firestore 문서 일괄 마이그레이션.
  - 실제 Android 기기 결제 알림 자동화.

## 검증 기준

- `npm.cmd run verify` 통과.
- `npm.cmd run apk:build` 통과.
- `npm.cmd run pages:build` 통과.
- `_site`에 새 APK와 `20260702-ingest-trace` 캐시버스터가 포함된다.
- 운영 Pages 배포 후 설정 화면에서 `수집 경로 점검` 패널이 보인다.
- Android 기기에서는 알림 접근 권한을 켠 뒤 native 로그가 `captured -> sent`로 바뀌는지 확인한다.
