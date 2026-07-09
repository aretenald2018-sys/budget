# 위젯 custom 포인트 항목 표시 개선 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-09-reward-widget-custom-point-items.md`
- 실행 slice: Android 위젯에 네 번째 custom 포인트 row 표시
- 요청: 새로 추가한 포인트 항목이 위젯에 표시되지 않는 문제 개선

## 변경 내용

- `utils/reward-savings.js`
  - `buildRewardWidgetSnapshot()`이 `pointBuckets`를 최대 4개까지 보존하도록 변경했다.
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
  - native snapshot normalize 단계도 최대 4개 bucket을 저장하도록 변경했다.
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - 네 번째 row를 렌더링한다.
  - custom bucket은 `label`에서 `포인트` suffix를 제거한 이름을 표시하고, mark는 label 첫 글자를 사용한다.
- `android/res/layout/reward_widget.xml`
  - 기존 24dp row anatomy를 유지한 네 번째 row slot을 추가했다.
- `android/res/xml/reward_widget_info.xml`
  - 네 번째 row가 작은 위젯에서 잘리지 않도록 `minHeight=180dp`, `minResizeHeight=160dp`로 갱신했다.
- `android/res/values/strings.xml`
  - widget description에서 “세 포인트” 고정 문구를 제거했다.
- `docs/design-system.md`
  - Android 홈 화면 위젯은 custom 포인트 항목 노출을 위해 최대 4개 row를 허용한다고 기록했다.
- `android/apk-version.json`, `render-settings.js`
  - Android APK를 `v2.1.8 / versionCode 19`로 올리고 다운로드 cache-bust를 `20260709-reward-widget-refresh`로 갱신했다.
- `render-report.js`, `render-settings.js`, `app.js`, `render-home.js`, `index.html`
  - 사용자가 “문제가 여전히 그대로”라고 보고한 뒤 stale JS cache-bust와 설정 저장 직후 widget snapshot refresh 누락을 추가 수정했다.
  - `refreshRewardWidgetSnapshot()`을 추가하고 보상 적립 설정 저장/초기화 직후 Android bridge에 최신 snapshot을 publish한다.
  - reward widget 관련 entry/import cache-bust를 `20260709-reward-widget-refresh`로 갱신했다.
- `scripts/verify-project.mjs`
  - 네 번째 custom bucket 보존, store/provider/layout 4-row 계약, APK version bump, description 문구를 검증한다.

## RED

- 명령: `npm.cmd run verify`
- 결과: 실패 확인
- 실패 메시지:
  - `Reward widget snapshot buckets are wrong`
  - 출력된 snapshot에는 `winePurchase`, `premiumIngredients`, `travelFund` 3개만 있었고 `gadgetFund`가 잘려 있었다.

## GREEN

- `ANDROID_HOME` 미설정으로 첫 `npm.cmd run apk:build` 실패:
  - `ANDROID_HOME or ANDROID_SDK_ROOT is required to build the APK.`
- SDK 경로 확인:
  - `C:\Users\USER\AppData\Local\Android\Sdk`
- `JAVA_HOME` 미설정으로 두 번째 APK build 실패:
  - `spawnSync javac ENOENT`
- Android Studio JBR 확인 후 성공:
  - 명령: `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' npm.cmd run apk:build`
  - 결과: `Android APK ready ... v2.1.7/18, local-persistent`
- review session에서 widget height metadata 문제를 발견해 `reward_widget_info.xml` 수정 후 APK 재빌드:
  - 결과: `Android APK ready ... v2.1.7/18, local-persistent`
- 사용자 재보고 후 RED:
  - 명령: `npm.cmd run verify`
  - 결과: 실패 확인
  - 실패 메시지:
    - `render-report.js is missing reward widget publish token: refreshRewardWidgetSnapshot.`
    - `render-report.js must cache-bust reward savings utility with 20260709-reward-widget-refresh.`
    - `app.js`/`render-home.js`/`index.html`/`render-settings.js` reward widget cache-bust 누락
    - `Reward settings save must refresh the Android reward widget snapshot after point item changes.`
- 사용자 재보고 후 GREEN:
  - 명령: `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' npm.cmd run apk:build`
  - 결과: `Android APK ready ... v2.1.8/19, local-persistent`
  - 명령: `npm.cmd run verify`
  - 결과: 통과, `verify-project passed (92 JS files checked).`
- 명령: `npm.cmd run verify`
  - 결과: 통과, `verify-project passed (92 JS files checked).`
- 명령: `npm.cmd run pages:build`
  - 결과: 통과, `_site` artifact 생성
- 명령: `git diff --check`
  - 결과: 통과

## 부분 runtime evidence

- 명령:
  - `node -e "import('./utils/reward-savings.js').then(...buildRewardWidgetSnapshot...)"`
- 결과:
  - `count=4`
  - keys: `winePurchase`, `premiumIngredients`, `travelFund`, `gadgetFund`
  - labels: `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`, `전자기기 포인트`
- APK metadata:
  - `public/downloads/budget-apk.json`
  - `versionCode=19`, `versionName=2.1.8`, `cacheBust=20260709-reward-widget-refresh`
- Pages artifact evidence:
  - `_site/index.html`: `app.js?v=20260709-reward-widget-refresh`
  - `_site/app.js`: `render-home.js?v=20260709-reward-widget-refresh`, `render-settings.js?v=20260709-reward-widget-refresh`, `render-report.js?v=20260709-reward-widget-refresh`
  - `_site/render-settings.js`: `refreshRewardWidgetSnapshot()` 호출, `v2.1.8 · Android APK`, `budget.apk?v=20260709-reward-widget-refresh`
  - `_site/render-report.js`: `utils/reward-savings.js?v=20260709-reward-widget-refresh`
- Emulator install/resource evidence:
  - AVD: `BudgetNotifApi35`
  - `adb install -r public/downloads/budget.apk`: `Success`
  - `dumpsys package com.aretenald.budget`: `versionCode=19`, `versionName=2.1.8`, `.RewardWidgetProvider` receiver 등록 확인
  - artifact QA: `aapt2 dump badging public/downloads/budget.apk`에서 `versionCode=19`, `versionName=2.1.8` 확인
  - `aapt2 dump xmltree --file res/xml/reward_widget_info.xml public/downloads/budget.apk`: `minHeight=180dp`, `minResizeHeight=160dp`, `initialLayout=@layout/reward_widget` 확인
- Android AppWidgetHost evidence:
  - 기존 compact QA host는 높이가 작아 3번째 row부터 clipping되어 provider 문제와 host 크기 문제를 분리하기 어려웠다.
  - 임시 tall host `com.aretenald.widgethostqatall`을 빌드/설치하고 `appwidget grantbind` 후 `RewardWidgetProvider`를 bind했다.
  - `uiautomator dump` 결과 `reward_widget_custom_row`, `reward_widget_custom_progress`, `reward_widget_custom_mark`, `reward_widget_custom`, `reward_widget_custom_value`가 실제 `AppWidgetHostView` hierarchy에 나타났다.
  - 기본 snapshot 상태에서 4번째 row text는 `포인트 -`, value는 `-`로 렌더링됐다.

## not verified yet

- headless emulator에서 launcher 홈 화면에 widget을 배치하는 시각 QA는 자동화하지 못했다. 대신 custom `AppWidgetHost` hierarchy로 실제 provider 4번째 row 렌더링을 확인했다.
- installed production-signed APK는 non-debuggable이라 private widget snapshot을 직접 주입하지 못해 Android 런타임에서 `전자기기` custom label이 표시되는 화면까지는 확인하지 못했다. JS snapshot 경로에서는 `전자기기 포인트` 보존을 확인했다.
- 에뮬레이터는 검증 후 `adb emu kill`로 종료했다.
- production deploy/push는 수행하지 않았다. 현재 작업트리에 기존 설정 CRUD 관련 dirty 변경이 함께 있어서 의도한 변경만 커밋/푸시하는 단계는 review session에서 분리해야 한다.
  - 현재 branch: `deploy/newsfeed-digest-20260707`, upstream: `origin/main`.
  - CI 배포 경로 자체는 `.github/workflows/pages.yml`에서 `npm run apk:build`, `npm run verify`, `npm run pages:build`를 수행하므로 source commit만 안전하게 올라가면 ignored APK artifact는 CI에서 재생성된다.
  - 차단 파일: `modals/tx-edit-modal.js`, `styles/60-urge.css`, `render-settings.js`의 포인트 정산 내역 UI 변경.

## 리뷰 대상

- `docs/ai/features/2026-07-09-reward-widget-custom-point-items.md`
- `docs/ai/executions/2026-07-09-reward-widget-custom-point-items.md`
- `utils/reward-savings.js`
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `android/res/layout/reward_widget.xml`
- `android/res/xml/reward_widget_info.xml`
- `android/res/values/strings.xml`
- `android/apk-version.json`
- `index.html`
- `app.js`
- `render-home.js`
- `render-report.js`
- `render-settings.js`의 APK version/cache-bust 및 `refreshRewardWidgetSnapshot()` 호출 라인
- `scripts/verify-project.mjs`
- `docs/design-system.md`
- `docs/ai/NEXT_ACTION.md`
