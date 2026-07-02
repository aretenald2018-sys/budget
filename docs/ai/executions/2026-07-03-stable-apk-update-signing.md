# 안정 APK 업데이트 설치 지원 실행

## 실행 내용

- `android/apk-version.json`을 추가해 APK `versionCode=2`, `versionName=2.0.1`, cache bust 값을 명시했다.
- `scripts/build-android-apk.mjs`가 APK version 정보를 `android/apk-version.json` 또는 환경변수에서 읽게 했다.
- 매번 새 `debug.keystore`를 만들던 흐름을 제거하고 안정 signing config를 사용하게 했다.
  - `BUDGET_ANDROID_KEYSTORE_BASE64`
  - `BUDGET_ANDROID_KEYSTORE_PATH`
  - 로컬 `.android-signing/budget-update.keystore`
- GitHub Actions Pages workflow의 APK build step에 Android signing secrets를 연결했다.
- `.android-signing/`을 `.gitignore`에 추가해 private key가 repo에 들어가지 않게 했다.
- 설정 화면의 앱 버전 표기를 `v2.0.1 · APK 업데이트 설치 지원`으로 갱신했다.
- APK 다운로드 링크 cache bust를 `20260703-stable-apk-v2`로 갱신했다.
- GitHub Secrets에 production signing 값을 등록했다.
  - `BUDGET_ANDROID_KEYSTORE_BASE64`
  - `BUDGET_ANDROID_KEYSTORE_PASSWORD`
  - `BUDGET_ANDROID_KEY_ALIAS`
  - `BUDGET_ANDROID_KEY_PASSWORD`

## 검증

- `node --check scripts/build-android-apk.mjs`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run apk:build`: 통과
  - local persistent key 최초 생성 확인
  - GitHub secret 경로를 로컬 재현해 `github-secret` mode 빌드 확인
- `public/downloads/budget-apk.json` 확인:
  - `versionCode=2`
  - `versionName=2.0.1`
  - `signing.mode=github-secret`
  - `signing.updateSafe=true`
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- APK manifest 확인:
  - package `com.aretenald.budget`
  - versionCode `2`
  - versionName `2.0.1`
- APK signing certificate 확인:
  - SHA-256 `bf49ffeafd491e3e67aa3be8e0b7aff15f06b0b5931fb5b6840141836ebfba91`

## 주의

- 이미 다른 signing certificate로 설치된 기존 APK는 Android 보안 정책상 삭제 후 재설치가 필요할 수 있다.
- 이번 APK를 한 번 설치한 뒤부터는 같은 certificate와 더 높은 versionCode로 빌드된 APK가 덮어쓰기 업데이트 조건을 만족한다.
- 다음 APK 배포 시 `android/apk-version.json`의 `versionCode`를 반드시 증가시켜야 한다.
