# 위젯과 홈 그래프 목록형 디자인 최종 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 실행:
  - `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice1.md`
  - `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice2.md`
- 리뷰:
  - `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-slice1-review.md`
  - `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-slice2-review.md`

## 결론

- 코드/빌드 관점의 blocking issue 없음.
- 요청한 구조 변경은 웹 홈 그래프와 Android 위젯 양쪽에 반영됐다.
- 완료 선언은 아직 보류한다. production GitHub Pages 배포와 실제 Android launcher preview/home 픽셀 시각 QA가 남아 있다.

## 확인한 항목

- 색상 변경이 아니라 구조 변경이라는 사용자 조건을 지켰다.
  - 웹은 기존 `var(--grad-bar)` 계열과 디자인 시스템 토큰을 유지했다.
  - Android 위젯도 기존 dark card/보라 progress DNA를 유지했다.
- 홈 탭 그래프
  - `오늘의 적립` 포인트 row와 홈 변동비 row가 rounded list widget anatomy로 바뀌었다.
  - 340px/390px/430px Playwright QA에서 overflow, console error, preview size text 노출 문제가 없었다.
  - 추가 live harness QA에서 `이번 2주`와 `이번 달` 상태를 모두 다시 열어 row anatomy를 확인했다.
- Android 위젯
  - 기존 하단 3열 텍스트가 세로 progress row로 바뀌었다.
  - `RewardWidgetProvider`는 snapshot만 읽고 network/secret 경로를 추가하지 않았다.
  - APK v2.1.3/14 빌드가 통과했고 APK 내부에 새 `reward_widget_*` 리소스가 포함됐다.
  - API 35 emulator에 APK update-install이 성공했고 설치된 package dump에서 `versionCode=13`, `versionName=2.1.2`, `RewardWidgetProvider`의 `APPWIDGET_UPDATE` receiver 등록을 확인했다.
  - custom `AppWidgetHost`로 실제 `RewardWidgetProvider` `RemoteViews`를 바인딩했고, UI hierarchy에서 `와인`, `재료`, `여행` 세 progress row가 모두 보이는 것을 확인했다.
- 배포 계약
  - repo root에 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION` 대상은 없었다.
  - JS/CSS cache bust는 `20260704-widget-graph-fill-v14`로 갱신됐다.
  - Settings APK 링크 cache bust는 `20260704-widget-graph-fill-v14`로 갱신됐다.
  - 홈탭 `와인구매 15%`처럼 낮은 비율 fill도 라벨 영역까지 보이도록 `--fill-pct`와 `.has-progress` 최소 표시 폭을 적용했다.

## 검증

- `node --check render-settings.js && node --check scripts/verify-project.mjs && node --check app.js && node --check render-home.js && git diff --check`: 통과
- `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="/c/Users/USER/AppData/Local/Android/Sdk" PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH" npm.cmd run apk:build`: 통과
- `npm.cmd run verify`: 통과, 87개 JS 파일 확인
- `npm.cmd run pages:build`: 통과
- `unzip -l public/downloads/budget.apk | rg "reward_widget|resources.arsc|AndroidManifest.xml"`: 새 위젯 리소스 포함 확인
- short-lived Playwright harness:
  - `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/home-widget-visual-qa.json`
  - `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/home-widget-cycle-340.png`
  - `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/home-widget-month-390.png`
  - `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/home-widget-cycle-430.png`
  - 결과: console error 없음, horizontal overflow 없음, reward row 3개와 variable row 5개 확인, `2x2/4x2` preview text 미노출
- Edge headless harness:
  - `.omo/evidence/2026-07-04-widget-graph-fill-fix/home-graph-fill-harness.png`
  - 결과: `와인구매 15%` row fill 표시 확인
- Android emulator install probe:
  - `adb -s emulator-5554 install -r public/downloads/budget.apk`: 통과
  - `dumpsys package com.aretenald.budget`: `versionCode=13`, `versionName=2.1.2`, `RewardWidgetProvider` receiver 확인
  - `monkey -p com.aretenald.budget -c android.intent.category.LAUNCHER 1`: `MainActivity` launch event 주입 성공
- Android custom widget host probe:
  - `adb shell appwidget grantbind --package com.aretenald.widgethostqa --user 0`: 통과
  - `dumpsys appwidget`: `provider=...RewardWidgetProvider`, `views=android.widget.RemoteViews` 확인
  - `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/widget-host-window-compact.xml`: `reward_widget_wine_row`, `reward_widget_ingredient_row`, `reward_widget_travel_row`, 각 `ProgressBar`, `와인 -`, `재료 -`, `여행 -` 확인

## 남은 gap

- not verified yet: production URL `https://aretenald2018-sys.github.io/budget/`에는 아직 배포하지 않았다.
- not verified yet: 실제 Android launcher 위젯 선택 화면 preview와 launcher 홈 화면에 배치된 widget의 픽셀 시각 상태는 아직 확인하지 않았다. 현재 emulator의 home activity가 `com.android.fakesystemapp/.launcher.EmptyHomeActivity`이고 `screencap` 결과가 all-black이라 픽셀 screenshot 증거를 만들 수 없다.
- not verified yet: Android `MainActivity`는 focus와 launch는 확인됐지만 WebView screenshot이 all-black으로 캡처됐다. 앱이 production URL을 로드하므로 production 배포 전 Android 앱 화면으로 새 홈 UI를 검증할 수 없다.
- not verified yet: 현재 worktree에는 unrelated dirty file `docs/ai/features/2026-07-04-telegram-newsfeed.md`가 남아 있으며, commit/push는 사용자의 명시적 요청 없이 진행하지 않는다.

## 다음 액션

- 상태: `needs_user_decision`
- 사용자 결정이 필요한 항목:
  - 의도한 파일만 commit/push해 GitHub Pages 배포를 진행할지 여부
  - widget host가 있는 Android 실기기 또는 emulator에서 launcher widget preview/home widget 시각 QA를 진행할 수 있는지 여부
