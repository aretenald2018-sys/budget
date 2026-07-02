# 공개 APK와 native 수집 APK 이원화 실행

## 실행 내용

- `MainActivity`가 build-generated `NativeHooks.attach(webView, this)`를 호출하게 했다.
- public build의 `NativeHooks`는 no-op으로 생성한다.
- native build의 `NativeHooks`는 `BudgetNativeBridge`를 `BudgetAndroid` JS interface로 붙인다.
- `scripts/build-android-apk.mjs`에 CLI 옵션을 추가했다.
  - `--native`
  - `--out <path>`
- `npm.cmd run apk:build:native`를 추가했다.
- native build 기본 출력은 `.android-private/budget-native.apk`로 분리했다.
- `.android-private/`를 `.gitignore`에 추가했다.
- 공개 APK version을 `2.0.3 / versionCode 4`로 올렸다.
- 설정 화면 문구를 공개/네이티브 수집 빌드 분리 기준으로 수정했다.

## 검증

- `node --check scripts/build-android-apk.mjs`: 통과
- `node --check app.js`: 통과
- `node --check render-settings.js`: 통과
- `npm.cmd run apk:build`: 통과
  - `versionCode=4`
  - `versionName=2.0.3`
  - `nativeIngestEnabled=false`
  - public APK size 12772 bytes
  - manifest permission `INTERNET` only
  - dex에 native ingest/JS bridge 문자열 없음
- `npm.cmd run apk:build:native`: 통과
  - `versionCode=4`
  - `versionName=2.0.3`
  - `nativeIngestEnabled=true`
  - native APK size 25057 bytes
  - manifest에 `notification-listener` component 있음
  - dex에 `BudgetNativeBridge`, `NativeIngestClient`, `addJavascriptInterface` 있음
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
