# Android 위젯 snapshot bridge 리뷰

## 기준

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 문서: `docs/ai/executions/2026-07-03-reward-widget-snapshot-bridge.md`
- 리뷰 대상: 슬라이스 3 `Android 위젯 snapshot bridge`

## findings

- 발견된 코드 결함 없음.
- 리뷰 중 `scripts/verify-project.mjs`가 Android `versionName`을 `2.1.0`으로 고정해 향후 APK 버전 업데이트를 막을 수 있는 점을 발견했고, `versionCode >= 11`과 설정 화면의 현재 `versionName` 표시 검증으로 수정했다.

## 확인한 내용

- `buildRewardWidgetSnapshot()`은 웹 계산 결과에서 위젯에 필요한 값만 추려 세 포인트 bucket을 고정 순서로 만든다.
- `render-report.js`의 bridge 호출은 홈 모드에서만 실행되고 `try/catch`로 격리되어 웹 렌더 실패를 만들지 않는다.
- `BudgetAndroidBridge`는 `updateRewardWidgetSnapshot(json)`과 `getRewardWidgetSnapshotJson()`만 추가하며 기존 알림/SMS capture 메서드를 건드리지 않는다.
- `RewardWidgetStore`는 `SharedPreferences`에 정규화된 JSON을 저장하고 네트워크/Firebase/secret 경로를 추가하지 않는다.
- APK 버전과 설정 화면 다운로드 cache-bust가 `v2.1.0` / `versionCode 11` / `20260703-reward-widget-bridge-v11`로 맞다.
- 실제 `AppWidgetProvider`와 launcher widget 등록은 아직 추가하지 않았고 다음 슬라이스 범위로 남아 있다.

## 검증 확인

- `npm.cmd run apk:build`
  - 통과: `public/downloads/budget.apk`, `v2.1.0/11`, `local-persistent`.
- `npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` 생성 완료.
- `git diff --check`
  - 통과.
- `adb devices`
  - `emulator-5554 device` 확인.
- `adb install -r public\downloads\budget.apk`
  - 통과: `Success`.
- production 배포:
  - 커밋 `61409b6`가 `main`에 푸시됨.
  - `Validate` workflow `28648401096` 성공.
  - `Deploy GitHub Pages` workflow `28648401081` 성공.
  - 운영 URL HTTP 200, 운영 `index.html` cache-bust, 운영 APK metadata `v2.1.0/11` 확인.

## residual risk

- Android WebView가 새 JS를 받아 실제 SharedPreferences snapshot을 저장하는 확인은 `not verified yet`.
- 이유: 현재 사용자의 실제 휴대폰을 연결할 수 없다. 에뮬레이터에는 APK 설치까지 했지만 WebView 화면이 검게 남아 홈 렌더와 snapshot 저장을 확인하지 못했다.
- 홈 화면 위젯 UI는 아직 없다. 이 리뷰는 snapshot bridge까지만 본다.

## 결론

- 슬라이스 3은 리뷰 기준으로 통과.
- 다음 액션은 실제 휴대폰 연결 없이 가능한 범위에서 슬라이스 4 `Android 홈 화면 위젯 구현`을 진행하는 것이다.
- 실기기에서 launcher 위젯 추가와 배경화면 표시 확인은 별도 검증으로 남긴다.
