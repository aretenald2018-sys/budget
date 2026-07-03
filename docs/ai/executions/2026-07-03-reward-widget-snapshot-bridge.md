# Android 위젯 snapshot bridge 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 슬라이스: 슬라이스 3 `Android 위젯 snapshot bridge`
- 실행 일시: 2026-07-03 KST

## 구현

- 웹 snapshot 계약
  - `utils/reward-savings.js`에 `buildRewardWidgetSnapshot()`을 추가했다.
  - snapshot은 `schemaVersion`, `updatedAt`, `baselineReady`, `todaySaved`, `todaySpend`, `dailyBaseline`, 세 `pointBuckets`만 담는다.
  - `render-report.js`는 홈 모드 렌더 후 `window.BudgetAndroid.updateRewardWidgetSnapshot(JSON.stringify(snapshot))`을 호출한다.
  - bridge 실패는 `try/catch`로 격리해 웹 홈 렌더를 막지 않는다.

- Android native 저장소
  - `RewardWidgetStore.java`를 추가해 snapshot을 `SharedPreferences`의 `budget_reward_widget_store` / `reward_snapshot`에 저장한다.
  - 저장 전 JSON을 정규화하고 point bucket은 최대 3개로 제한한다.
  - 네트워크, Firebase, secret 경로는 추가하지 않았다.

- WebView bridge
  - `BudgetAndroidBridge.java`에 `updateRewardWidgetSnapshot(json)`과 `getRewardWidgetSnapshotJson()`을 추가했다.
  - 다음 슬라이스의 `AppWidgetProvider`가 같은 저장소를 읽을 수 있게 분리했다.

- 배포/cache
  - `app.js`의 `render-report.js`, `render-settings.js` import query를 `20260703-reward-widget-bridge`로 갱신했다.
  - `index.html` app module query도 같은 버전으로 갱신했다.
  - Android APK 버전을 `v2.1.0` / `versionCode 11`로 올리고 APK 다운로드 cache-bust를 `20260703-reward-widget-bridge-v11`로 갱신했다.

- 검증 계약
  - `scripts/verify-project.mjs`에 reward widget bridge smoke를 추가했다.
  - `RewardWidgetStore`, bridge 메서드, browser publish hook, cache-bust, APK 버전, snapshot bucket 값을 검증한다.

## 검증

- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node --check .\render-report.js; node --check .\utils\reward-savings.js; node --check .\scripts\verify-project.mjs`
  - 통과.
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run apk:build`
  - 통과: `public/downloads/budget.apk` 생성, `v2.1.0/11`, `local-persistent`.
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `adb devices`
  - `emulator-5554 device` 확인.
- `adb root`
  - root 접근 가능 확인.
- `adb install -r public\downloads\budget.apk`
  - 통과: `Success`.

## 미검증

- production GitHub Pages 배포 후 Android WebView가 새 운영 JS를 받아 실제 `budget_reward_widget_store` SharedPreferences에 snapshot을 저장하는지 확인해야 한다.
- 실제 홈 화면 위젯 UI는 다음 슬라이스 4 범위다.

## 변경 파일

- `android/apk-version.json`
- `android/src/com/aretenald/budget/BudgetAndroidBridge.java`
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
- `app.js`
- `index.html`
- `render-report.js`
- `render-settings.js`
- `scripts/verify-project.mjs`
- `utils/reward-savings.js`
- `docs/ai/executions/2026-07-03-reward-widget-snapshot-bridge.md`
- `docs/ai/NEXT_ACTION.md`

## 다음 액션

- 이 실행 결과를 리뷰한다.
- 리뷰 통과 후 production에 배포하고, 에뮬레이터에서 앱 홈 진입 뒤 SharedPreferences snapshot 저장을 확인한다.
