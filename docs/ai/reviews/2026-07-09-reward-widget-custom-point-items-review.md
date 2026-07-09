# 위젯 custom 포인트 항목 표시 개선 리뷰

## 대상

- 계획 문서: `docs/ai/features/2026-07-09-reward-widget-custom-point-items.md`
- 실행 문서: `docs/ai/executions/2026-07-09-reward-widget-custom-point-items.md`
- 주요 변경:
  - `utils/reward-savings.js`
  - `android/src/com/aretenald/budget/RewardWidgetStore.java`
  - `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - `android/res/layout/reward_widget.xml`
  - `android/res/xml/reward_widget_info.xml`
  - `android/res/values/strings.xml`
  - `android/apk-version.json`
  - `render-settings.js` APK version/cache-bust 라인
  - `scripts/verify-project.mjs`
  - `docs/design-system.md`
  - `docs/ai/NEXT_ACTION.md`

## 리뷰 결과

- 판정: `PASS_WITH_GAPS`
- 기능 범위는 계획대로 구현됐다.
- review 중 발견한 blocking issue 1건은 같은 세션에서 수정했다.
- 남은 gap은 구현 문제가 아니라 검증 환경/배포 환경 gap이다.

## 확인한 요구사항

- `buildRewardWidgetSnapshot()`이 네 번째 custom point bucket을 보존한다.
  - 증거: 직접 import 실행 결과 `count=4`, `gadgetFund`, `전자기기 포인트`.
- native store가 네 번째 bucket을 자르지 않는다.
  - 증거: `RewardWidgetStore`의 `MAX_WIDGET_POINT_BUCKETS = 4`.
- provider/layout에 네 번째 row slot이 있다.
  - 증거: `reward_widget_custom`, `reward_widget_custom_mark`, `reward_widget_custom_value`, `reward_widget_custom_progress`.
- custom label 표시 경로가 있다.
  - 증거: provider가 `bucket.optString("label", "")`를 `shortLabel()`에 넘기고, custom key는 label에서 `포인트` suffix를 제거해 표시한다.
- 네 번째 row가 작은 widget metadata에서 잘릴 리스크를 줄였다.
  - 증거: `reward_widget_info.xml`의 `minHeight=180dp`, `minResizeHeight=160dp`.
- APK 갱신 경로가 반영됐다.
  - 증거: `android/apk-version.json` `versionCode=19`, `versionName=2.1.8`, `cacheBust=20260709-reward-widget-refresh`.
- 사용자가 보고한 “여전히 그대로” 경로를 추가로 막았다.
  - 증거: `render-report.js`의 `refreshRewardWidgetSnapshot()`, `render-settings.js`의 설정 저장/초기화 직후 호출, `20260709-reward-widget-refresh` cache-bust.

## 발견 및 수정

### FIXED: 4-row layout height metadata 누락

- 문제:
  - 최초 실행 변경은 24dp row를 네 개로 늘렸지만 `reward_widget_info.xml`은 기존 `minHeight=150dp`, `minResizeHeight=130dp`였다.
  - 이 상태면 작은 launcher widget에서 네 번째 row가 잘려 “표시되지 않음” 증상이 남을 수 있었다.
- 수정:
  - `minHeight=180dp`, `minResizeHeight=160dp`로 변경했다.
  - `scripts/verify-project.mjs`에 해당 token 검증을 추가했다.
- 확인:
  - APK 재빌드 후 `aapt2 dump xmltree --file res/xml/reward_widget_info.xml public/downloads/budget.apk`에서 `minHeight=180dp`, `minResizeHeight=160dp`, `initialLayout=@layout/reward_widget` 확인.

## 검증

- `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' npm.cmd run apk:build`
  - 통과, `Android APK ready ... v2.1.8/19, local-persistent`
- `npm.cmd run verify`
  - 통과, `verify-project passed (92 JS files checked).`
- `npm.cmd run pages:build`
  - 통과, `_site` artifact 생성
- `_site` artifact QA:
  - `index.html` app entry `20260709-reward-widget-refresh`
  - `app.js`/`render-home.js`/`render-report.js`/`render-settings.js` reward widget import token `20260709-reward-widget-refresh`
  - `render-settings.js` save/reset path에 `refreshRewardWidgetSnapshot()` 호출
  - `downloads/budget-apk.json` `versionCode=19`, `cacheBust=20260709-reward-widget-refresh`
- Production deploy:
  - commit `bd54a69` push 완료
  - GitHub Pages workflow `29049035246` success
  - `https://aretenald2018-sys.github.io/budget/?deploy=bd54a69` HTTP 200
  - production `index.html`에서 `app.js?v=20260709-reward-widget-refresh` 확인
  - production `render-report.js?v=20260709-reward-widget-refresh`에서 `refreshRewardWidgetSnapshot`, `reward-savings.js?v=20260709-reward-widget-refresh` 확인
  - production `render-settings.js?v=20260709-reward-entry-crud`에서 `refreshRewardWidgetSnapshot`, `v2.1.8`, `budget.apk?v=20260709-reward-widget-refresh` 확인
  - production `downloads/budget-apk.json`에서 `versionCode=19`, `versionName=2.1.8`, `cacheBust=20260709-reward-widget-refresh` 확인
  - production `downloads/budget.apk?v=20260709-reward-widget-refresh` HTTP 200
- `git diff --check`
  - 통과
- Emulator partial QA:
  - AVD `BudgetNotifApi35` 부팅
  - `adb install -r public/downloads/budget.apk`: `Success`
  - `dumpsys package com.aretenald.budget`: `versionCode=19`, `versionName=2.1.8`, `.RewardWidgetProvider` receiver 등록 확인
  - `aapt2 dump resources`: `reward_widget_custom*` id와 `reward_widget_description` string 포함 확인
  - `aapt2 dump xmltree`: widget info metadata 확인
- Android AppWidgetHost QA:
  - 임시 tall host `com.aretenald.widgethostqatall` 설치 및 `appwidget grantbind` 후 `RewardWidgetProvider` bind 확인
  - UIAutomator hierarchy에서 `reward_widget_custom_row`, `reward_widget_custom_mark` text `포`, `reward_widget_custom` text `포인트 -`, `reward_widget_custom_value` text `-` 확인

## not verified yet

- Headless emulator에서 launcher 홈 화면에 widget을 실제로 배치하는 시각 확인은 하지 못했다. 대신 custom `AppWidgetHost`에서 실제 provider 4번째 row hierarchy를 확인했다.
- Installed production-signed APK는 non-debuggable이라 private widget snapshot을 직접 주입하지 못해 Android 런타임에서 `전자기기` custom label이 표시되는 화면까지는 확인하지 못했다. JS snapshot 경로에서는 `전자기기 포인트` 보존을 확인했다.

## 다음 액션

- Android 실제 기기 또는 visible emulator에서 `v2.1.8` APK 설치 후 홈 화면 위젯을 배치하고 앱 로그인/설정 저장 뒤 새 custom 포인트 라벨이 표시되는지 확인한다.
