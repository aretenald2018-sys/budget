# Play Protect 대응 공개 APK 분리

## 목표

- 웹에서 내려받는 기본 `budget.apk`가 Play Protect 설치 차단을 덜 받도록 민감 native notification ingest 기능을 제외한다.
- 공개 APK는 앱 실행과 웹 UI 사용에 필요한 최소 권한만 포함한다.
- native notification ingest 기능은 source에는 유지하되 `BUDGET_ANDROID_NATIVE_INGEST=true`일 때만 빌드된다.
- 배포 APK 메타데이터에 native ingest 포함 여부를 기록한다.

## 비목표

- Play Store 등록은 하지 않는다.
- Play Protect 자체를 우회하거나 끄는 절차를 앱에서 안내하지 않는다.
- 알림 접근 native ingest를 공개 APK에서 계속 제공하지 않는다.

## 실행 슬라이스

### 슬라이스 1: 공개 APK 안전화

- 기본 manifest에서 notification listener service 선언 제거.
- `scripts/build-android-apk.mjs`에 `BUDGET_ANDROID_NATIVE_INGEST` 옵션 추가.
- 기본 빌드에서는 native ingest Java 파일을 dex에서 제외.
- native ingest 옵션이 켜진 경우에만 manifest service block을 build manifest에 삽입.
- `MainActivity`는 native bridge class가 있을 때만 reflection으로 bridge를 붙인다.
- APK version을 `2.0.2 / versionCode 3`으로 올린다.
- 설정 화면 앱 버전/다운로드 cache bust/Android 알림 수집 문구를 공개 APK 기준으로 수정한다.

## 검증 기준

- 기본 APK manifest에 `NotificationListenerService`가 없어야 한다.
- 기본 APK dex/classes에 native ingest class가 없어야 한다.
- 기본 APK permission은 `INTERNET`만 남아야 한다.
- `BUDGET_ANDROID_NATIVE_INGEST=true` 빌드는 listener service와 native class를 포함해야 한다.
- `npm.cmd run verify`, `npm.cmd run apk:build`, `npm.cmd run pages:build` 통과.
