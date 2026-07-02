# Android 자체 수집과 경로 추적성 실행

## 실행 내용

- Android APK에 `BudgetNotificationListener`, `BudgetNativeBridge`, `NativeIngestClient`, `NativeIngestStore`를 추가했다.
- `MainActivity`가 `window.BudgetAndroid` bridge를 제공하게 했다.
- native payload를 `source=native_notification`, `ingestOrigin=android_native`, `ingestClient=android_notification_listener`로 보낸다.
- 서버 normalize가 incoming `meta` 객체를 보존하게 했다.
- raw/transaction 저장 문서에 `ingestOrigin`, `ingestChannel`, `ingestClient`, `ingest` 객체를 추가했다.
- 설정 화면에 Firestore raw 기준 `수집 경로 점검`과 APK 전용 `Android 알림 수집` 설정 패널을 추가했다.
- Windows APK 빌드에서 `d8.bat` 실패가 나지 않도록 `d8.jar`/`apksigner.jar`를 `java`로 직접 호출하게 보강했다.

## 검증

- `node --check api/_lib/request-payload.js`: 통과
- `node --check api/_lib/auto-ingest.js`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `node --check scripts/build-android-apk.mjs`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run apk:build`: 통과, `public/downloads/budget.apk` 25058 bytes
- `npm.cmd run pages:build`: 통과
- `_site` 확인:
  - `app.js?v=20260702-ingest-trace`
  - `render-settings.js?v=20260702-ingest-trace`
  - `수집 경로 점검`
  - `Android 알림 수집`
  - `_site/downloads/budget.apk` 25058 bytes
- GitHub Pages 설정을 workflow artifact 배포로 보정했다.
  - `build_type=workflow`
  - production URL: `https://aretenald2018-sys.github.io/budget/`
- GitHub Pages workflow run `28592454290`: 성공
  - head SHA: `70b52bf3e5d3c7f42e5e5e52b98dadca04c090e3`
  - build/deploy job 모두 통과
- 운영 URL 확인:
  - `https://aretenald2018-sys.github.io/budget/`: HTTP 200
  - `https://aretenald2018-sys.github.io/budget/downloads/budget.apk?v=20260702-ingest-trace`: HTTP 200, `application/vnd.android.package-archive`, 25058 bytes
  - `https://aretenald2018-sys.github.io/budget/android-apk.svg?v=20260702-ingest-trace`: HTTP 200
- 운영 UI 확인:
  - `./app.js?v=20260702-ingest-trace` 로드 확인
  - 설정 탭에서 `수집 경로 점검` 패널 노출 확인
  - 설정 탭에서 `Android 알림 수집` 패널 노출 확인
  - APK 링크 `./downloads/budget.apk?v=20260702-ingest-trace` 확인

## 남은 기기 검증

- 실제 Android 기기에서 새 APK 설치.
- 설정에서 token 저장.
- Android `알림 접근` 권한 켜기.
- 실제 결제 알림 또는 테스트 결제 알림 이후 APK 내부 로그가 `전송됨`으로 바뀌고, 서버 raw에 `ingestOrigin=android_native`가 남는지 확인.
