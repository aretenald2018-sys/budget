# 공개 다운로드 APK native ingest 포함 전환

## 배경

- 사용자가 기기에서 Play Protect를 꺼서 설치 차단 리스크를 감수하기로 했다.
- 현재 설정 하단의 `Android APK 다운로드` 버튼은 `public/downloads/budget.apk`를 받지만, 이 파일은 `nativeIngestEnabled=false`인 안전형 public APK다.
- 사용자는 별도 private APK 경로 없이 설정 화면 하단 버튼 하나로 알림 수집 포함 APK를 내려받고 설치하길 원한다.

## 목표

- GitHub Pages에 공개되는 `downloads/budget.apk`를 native notification ingest 포함 APK로 빌드한다.
- 설정 하단 다운로드 버튼이 같은 `downloads/budget.apk`를 계속 가리키되, 문구와 cache-bust를 native 포함 버전에 맞춘다.
- 기존 설치본 위에 업데이트될 수 있도록 Android `versionCode`를 올린다.
- 배포 metadata `downloads/budget-apk.json`의 `nativeIngestEnabled`가 `true`임을 검증한다.

## 실행 슬라이스

1. `public-native-ingest-apk`
   - `package.json`의 기본 `apk:build`가 `--native --out public/downloads/budget.apk`로 빌드하게 변경한다.
   - `android/apk-version.json`을 `versionCode=5`, `versionName=2.0.4`, 새 cache-bust로 갱신한다.
   - `render-settings.js`의 앱 정보/다운로드 문구와 APK URL query를 갱신한다.
   - `scripts/verify-project.mjs`에 기본 APK가 native 포함 공개 APK라는 계약 검사를 추가한다.

## 제외

- 알림 파서/서버 ingest 로직 변경.
- 패키지명 또는 signing key 변경.
- Play Protect 우회 안내 추가.

## 검증

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- GitHub Actions Pages build에서 `Build Android APK`, `Verify`, `Deploy` 성공
- 운영 `downloads/budget-apk.json`에서 `nativeIngestEnabled=true`, `versionCode=5` 확인

## NEXT_ACTION.md 업데이트

- 상태: `ready_for_execution`
- 다음 실행 슬라이스: `public-native-ingest-apk`
