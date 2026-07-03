# Android 오늘의 적립 위젯 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 슬라이스: 슬라이스 4 `Android 홈 화면 위젯 구현`
- 실행 일시: 2026-07-03 KST

## 구현

- Android App Widget
  - `RewardWidgetProvider.java`를 추가했다.
  - launcher 위젯은 `RewardWidgetStore.snapshotJson()`의 마지막 snapshot을 읽어 `RemoteViews`로 렌더한다.
  - 표시 값은 `오늘의 적립`, 갱신 시각, 오늘 절약액, 평소 기준액, `와인`, `재료`, `여행` 오늘 포인트다.
  - snapshot이 없으면 `앱을 열어 갱신` empty state를 표시한다.
  - 위젯을 누르면 `MainActivity`가 열린다.

- 위젯 리소스
  - `android/res/xml/reward_widget_info.xml`을 추가해 홈 화면 위젯으로 등록했다.
  - `android/res/layout/reward_widget.xml`을 추가했다.
  - `android/res/drawable/reward_widget_background.xml`을 추가했다.
  - `strings.xml`에 `reward_widget_name`, `reward_widget_description`을 추가했다.

- Manifest 등록
  - `AndroidManifest.xml`에 `.RewardWidgetProvider` receiver를 등록했다.
  - `android.appwidget.action.APPWIDGET_UPDATE`와 `@xml/reward_widget_info` metadata를 연결했다.

- Snapshot 갱신 연동
  - `RewardWidgetStore.saveSnapshot()`이 snapshot 저장 후 `RewardWidgetProvider.updateAll(context)`를 호출한다.
  - 위젯에서 직접 Firestore, 네트워크, secret을 읽는 경로는 추가하지 않았다.

- APK/cache
  - Android APK 버전을 `v2.1.1` / `versionCode 12`로 올렸다.
  - APK cache-bust를 `20260703-reward-widget-provider-v12`로 갱신했다.
  - `render-settings.js`, `app.js`, `index.html` cache-bust를 새 위젯 provider 버전에 맞췄다.

- 검증 계약
  - `scripts/verify-project.mjs`에 widget provider contract를 추가했다.
  - manifest receiver, provider class, widget info/layout/string/resource, no-network/no-secret, snapshot 저장 후 widget refresh를 확인한다.

## 검증

- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; node --check .\scripts\verify-project.mjs; node --check .\render-report.js; node --check .\utils\reward-savings.js`
  - 통과.
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run apk:build`
  - 통과: `public/downloads/budget.apk`, `v2.1.1/12`, `local-persistent`.
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ANDROID_HOME='C:\Users\USER\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `git diff --check`
  - 통과.

## 미검증

- 실제 휴대폰을 현재 연결할 수 없어 다음은 `not verified yet`:
  - 휴대폰에 APK 설치/업데이트.
  - Android launcher 위젯 목록에 `오늘의 적립` 위젯이 보이는지 확인.
  - 홈 화면에 위젯 추가.
  - 앱 홈 진입 후 snapshot이 저장되고 위젯에 세 포인트가 표시되는지 확인.

## 변경 파일

- `android/AndroidManifest.xml`
- `android/apk-version.json`
- `android/res/drawable/reward_widget_background.xml`
- `android/res/layout/reward_widget.xml`
- `android/res/values/strings.xml`
- `android/res/xml/reward_widget_info.xml`
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
- `app.js`
- `index.html`
- `render-settings.js`
- `scripts/verify-project.mjs`
- `docs/ai/executions/2026-07-03-reward-widget-provider.md`
- `docs/ai/NEXT_ACTION.md`

## 다음 액션

- 이 실행 결과를 리뷰한다.
- 리뷰 통과 후 production에 배포한다.
- 실기기 확인은 휴대폰 연결 가능한 시점에 별도 검증한다.
