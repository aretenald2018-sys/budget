# 안정 APK 업데이트 설치 지원

## 배경

현재 Android APK는 웹에서 내려받아 설치할 수 있지만, 기존 설치본 위에 덮어쓰기 업데이트가 되지 않고 삭제 후 재설치를 요구할 수 있다.

원인은 Play Store 미등록 자체가 아니라 Android 업데이트 조건이다. 같은 앱으로 업데이트되려면 다음 조건을 만족해야 한다.

- package name이 동일해야 한다.
- 이전 설치본과 새 APK의 signing certificate가 동일해야 한다.
- 새 APK의 versionCode가 기존 설치본보다 커야 한다.

현재 `scripts/build-android-apk.mjs`는 매 빌드마다 `.android-build/debug.keystore`를 새로 생성하고, `versionCode=1`을 고정 사용한다. 따라서 Android가 같은 앱의 정상 업데이트로 인정하기 어렵다.

## 목표

- APK 빌드가 안정 signing key를 사용할 수 있게 한다.
- APK versionCode/versionName을 명시 파일에서 관리하고 배포 때 증가시킬 수 있게 한다.
- GitHub Pages 배포 workflow에서도 같은 signing key를 사용할 수 있게 한다.
- repo에는 private signing key를 커밋하지 않는다.
- 설정 화면의 APK 다운로드 캐시버스터와 앱 정보가 새 APK 버전을 가리키게 한다.

## 비목표

- Play Store 등록 자동화는 하지 않는다.
- Android 기기의 기존 랜덤 debug-key 설치본을 무삭제로 마이그레이션하지 않는다. 이미 다른 certificate로 설치된 APK는 Android 보안 정책상 삭제 후 재설치가 필요할 수 있다.
- 앱 내부 자동 업데이트 설치 권한 요청 플로우는 만들지 않는다.

## 실행 슬라이스

### 슬라이스 1: 빌드/서명 안정화

- `android/apk-version.json` 추가.
- `scripts/build-android-apk.mjs`가 versionCode/versionName을 이 파일 또는 환경변수에서 읽게 한다.
- build script가 release keystore를 다음 순서로 찾게 한다.
  - `BUDGET_ANDROID_KEYSTORE_BASE64`
  - `BUDGET_ANDROID_KEYSTORE_PATH`
  - 로컬 개발용 persistent keystore 경로
- GitHub Actions에는 `BUDGET_ANDROID_KEYSTORE_BASE64`, `BUDGET_ANDROID_KEYSTORE_PASSWORD`, `BUDGET_ANDROID_KEY_ALIAS`, `BUDGET_ANDROID_KEY_PASSWORD` secret을 사용한다.
- secret이 없는 production build는 update-safe APK가 아님을 빌드 메타데이터에 남긴다.

### 슬라이스 2: 운영 표시와 검증

- `public/downloads/budget-apk.json`에 signing mode, versionCode, versionName을 기록한다.
- 설정 화면 APK 다운로드 링크 캐시버스터를 새 버전으로 갱신한다.
- `npm.cmd run verify`, `npm.cmd run apk:build`, `npm.cmd run pages:build`를 확인한다.
- 가능하면 GitHub secret을 등록한 뒤 production Pages workflow까지 확인한다.

## 검증 기준

- 로컬 APK 빌드가 성공한다.
- APK metadata에 versionCode/versionName/signing mode가 기록된다.
- 같은 signing key와 증가한 versionCode를 쓰는 다음 빌드부터 Android 덮어쓰기 설치 조건을 만족한다.
- 운영 APK URL이 HTTP 200으로 응답한다.
