# Android 위젯 목록형 레이아웃 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 실행: `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice2.md`
- 슬라이스: 2 `Android 홈 화면 위젯 목록형 레이아웃`

## 결론

- blocking issue 없음.
- 리뷰 중 발견한 clipping 위험은 실행 변경 안에서 수정했고, custom `AppWidgetHost` UI hierarchy로 세 row 노출을 확인했다.
- Android APK 빌드, 프로젝트 검증, Pages artifact 빌드는 통과했다.

## 확인한 내용

- `android/res/layout/reward_widget.xml`
  - 기존 하단 3열 텍스트가 세로 rounded row + horizontal progress + label/value overlay 구조로 바뀌었다.
  - `ProgressBar`, `FrameLayout`, `LinearLayout`, `TextView`만 사용해 `RemoteViews` 지원 범위 안에 있다.
  - custom `AppWidgetHost` 150dp 높이에서 세 번째 row가 잘릴 수 있어 row 높이, marker 크기, text size, 상단 금액 영역을 추가 압축하고 `minHeight`를 150dp로 유지했다.
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - 위젯은 계속 `RewardWidgetStore.snapshotJson()`만 읽는다.
  - `monthPoints / targetAmount`를 0-100으로 clamp해 progress를 채운다.
  - `todayBonusPoints`는 focus bucket에만 조용한 suffix로 표시한다.
  - Firestore, HTTP, Gemini/Firebase/Gmail secret 경로는 추가되지 않았다.
- `android/res/xml/reward_widget_info.xml`
  - `previewImage`가 `@drawable/ic_launcher`에서 `@drawable/reward_widget_preview`로 바뀌었다.
  - `previewLayout="@layout/reward_widget"`가 추가됐다.
- `render-settings.js`, `android/apk-version.json`
  - Settings APK 링크와 Android version metadata가 v2.1.3/14, `20260704-widget-graph-fill-v14`로 맞다.
- `scripts/verify-project.mjs`
  - 새 widget layout/provider/drawable/APK 계약을 검증한다.

## 검증

- `node --check render-settings.js && node --check scripts/verify-project.mjs && node --check app.js && node --check render-home.js && git diff --check`: 통과
- `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="/c/Users/USER/AppData/Local/Android/Sdk" PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH" npm.cmd run apk:build`: 통과, `public/downloads/budget.apk` v2.1.3/14 생성
- Edge headless harness `.omo/evidence/2026-07-04-widget-graph-fill-fix/home-graph-fill-harness.png`: `와인구매 15%` row fill 표시 확인
- `npm.cmd run verify`: 통과, 87개 JS 파일 확인
- `npm.cmd run pages:build`: 통과, `_site` 생성
- `unzip -l public/downloads/budget.apk | rg "reward_widget|resources.arsc|AndroidManifest.xml"`: 새 `reward_widget_*` drawable/layout/xml 리소스 포함 확인
- `adb -s emulator-5554 install -r public/downloads/budget.apk`: 통과
- `dumpsys package com.aretenald.budget`: installed `versionCode=13`, `versionName=2.1.2`, `RewardWidgetProvider` `APPWIDGET_UPDATE` receiver 확인. 이후 로컬 APK 산출물은 v2.1.3/14까지 갱신했다.
- `adb shell appwidget grantbind --package com.aretenald.widgethostqa --user 0` + custom `AppWidgetHost` launch: `dumpsys appwidget`에서 `provider=...RewardWidgetProvider`, `views=android.widget.RemoteViews` 확인
- `uiautomator dump` + `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/widget-host-window-compact.xml`: 실제 `com.aretenald.budget` 위젯 계층에서 `reward_widget_wine_row`, `reward_widget_ingredient_row`, `reward_widget_travel_row`, 각 `ProgressBar`, `와인 -`, `재료 -`, `여행 -` 확인

## 남은 위험

- not verified yet: 실제 Android launcher 위젯 선택 화면 preview와 launcher 홈 화면에 배치된 위젯의 픽셀 시각 상태는 확인하지 않았다. 현재 emulator home은 `com.android.fakesystemapp/.launcher.EmptyHomeActivity`이고 `screencap` 결과가 all-black이라 픽셀 screenshot 증거를 만들 수 없다.
- not verified yet: production GitHub Pages 배포는 수행하지 않았다. git 작업 규칙상 commit/push는 사용자가 명시적으로 요청해야 하며, 현재 unrelated dirty file `docs/ai/features/2026-07-04-telegram-newsfeed.md`도 남아 있다.

## 다음 단계

- 상태: `ready_for_review`
- 다음 액션: 슬라이스 3 `디자인/기능 리뷰`
- 리뷰 중에는 새 기능을 추가하지 않고, 계획 전체 대비 남은 verification/deploy gap만 판단한다.
