# 공개 다운로드 APK native ingest 포함 전환 실행

## 실행 내용

- `npm.cmd run apk:build`가 `--native --out public/downloads/budget.apk`로 실행되게 변경했다.
- GitHub Pages workflow는 기존대로 `npm run apk:build`를 호출하므로, 다음 배포부터 공개 `downloads/budget.apk`가 native notification ingest 포함 APK로 빌드된다.
- Android APK 버전을 `versionCode=5`, `versionName=2.0.4`, `cacheBust=20260703-public-native-v5`로 올렸다.
- 설정 화면 앱 정보와 다운로드 링크를 `v2.0.4 · 알림 수집 포함 APK` / `./downloads/budget.apk?v=20260703-public-native-v5`로 갱신했다.
- 웹 브라우저에서 Android 알림 수집 설정이 비활성일 때 문구를 “APK 설치 후 앱 안에서 설정” 기준으로 바꿨다.
- `scripts/verify-project.mjs`에 기본 APK 빌드가 public native ingest APK를 만들도록 계약 검사를 추가했다.

## 검증

- `node --check scripts/verify-project.mjs`: 통과
- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `node --check scripts/build-android-apk.mjs`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site/index.html`, `_site/app.js`, `_site/render-settings.js`에 새 cache-bust와 다운로드 문구 반영 확인.
- `npm.cmd run apk:build`: not verified yet. 로컬 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 `ANDROID_HOME or ANDROID_SDK_ROOT is required to build the APK.`로 중단됐다.

## 배포 검증 예정

- GitHub Actions `Deploy GitHub Pages`의 `Build Android APK`, `Verify`, `Deploy` 성공 확인.
- 운영 `https://aretenald2018-sys.github.io/budget/downloads/budget-apk.json`에서 `nativeIngestEnabled=true`, `versionCode=5`, `versionName=2.0.4` 확인.

## NEXT_ACTION.md 업데이트

- 상태: `ready_for_review`
- 리뷰 대상: 이번 실행 변경 파일 전체
