# Android 위젯 목록형 레이아웃 실행

## 범위

- 계획: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 슬라이스: 2 `Android 홈 화면 위젯 목록형 레이아웃`
- 목표: Android 홈 화면 위젯을 첨부 2번 사진의 위젯 선택 화면처럼 둥근 목록 row와 진행 막대 구조로 바꾸되, 기존 앱 색상 체계와 데이터 흐름은 유지한다.

## 변경 파일

- `android/res/layout/reward_widget.xml`
- `android/res/drawable/reward_widget_mark_background.xml`
- `android/res/drawable/reward_widget_preview.xml`
- `android/res/drawable/reward_widget_progress.xml`
- `android/res/drawable/reward_widget_row_background.xml`
- `android/res/xml/reward_widget_info.xml`
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `android/apk-version.json`
- `render-settings.js`
- `scripts/verify-project.mjs`
- `app.js`
- `index.html`
- `render-home.js`
- `style.css`
- `public/downloads/budget.apk`
- `public/downloads/budget-apk.json`

## 구현 내용

- `reward_widget.xml`의 세 포인트 버킷을 각각 rounded row + horizontal progress bar + label/value overlay 구조로 바꿨다.
- row 3개가 실제 widget host 높이에서 잘릴 위험을 줄이기 위해 row 높이, marker/text scale, 상단 금액 영역을 압축하고 widget 기본 높이를 150dp로 조정했다.
- `RewardWidgetProvider`가 `pointBuckets[].monthPoints`, `targetAmount`, `todayBonusPoints`, `focusBucketKey`를 사용해 각 row의 label, bonus, progress percent, value를 채우도록 변경했다.
- 위젯 preview drawable과 `previewLayout`을 추가해 Android 위젯 선택 화면에서도 실제 목록형 레이아웃에 가까운 미리보기를 노출하도록 했다.
- APK 버전을 `2.1.3` / `versionCode 14`로 올리고 Settings의 다운로드 링크 cache bust를 `20260704-widget-graph-fill-v14`로 갱신했다.
- 웹 모듈 cache bust를 `20260704-widget-graph-fill-v14`로 갱신해 이전 slice1 CSS/JS 변경과 새 Settings APK 링크가 함께 재로드되도록 했다.
- 사용자 피드백으로 확인된 낮은 비율 fill 미노출을 수정했다. 홈탭 row fill은 `--fill-pct` 기반으로 그리며, `.has-progress` 최소 표시 폭으로 `와인구매 15%` 같은 낮은 비율도 라벨 영역까지 색이 보인다.
- `scripts/verify-project.mjs`에 새 위젯 layout/drawable/provider/APK 버전 계약을 추가했다.

## 검증

- `node --check render-settings.js && node --check scripts/verify-project.mjs && node --check app.js && node --check render-home.js && git diff --check`: 통과
- `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="/c/Users/USER/AppData/Local/Android/Sdk" PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH" npm.cmd run apk:build`: 통과, `public/downloads/budget.apk` v2.1.3/14 생성
- Edge headless harness `.omo/evidence/2026-07-04-widget-graph-fill-fix/home-graph-fill-harness.png`: `와인구매 15%` row fill 표시 확인
- `npm.cmd run verify`: 통과, 87개 JS 파일 확인
- `npm.cmd run pages:build`: 통과, `_site` 생성
- `unzip -l public/downloads/budget.apk | rg "reward_widget|resources.arsc|AndroidManifest.xml"`: 새 위젯 layout/drawable/xml 리소스 포함 확인
- Android emulator custom `AppWidgetHost` probe: `com.aretenald.widgethostqa`에 `grantbind --user 0` 권한을 부여하고 `RewardWidgetProvider`를 바인딩했다. `dumpsys appwidget`에서 `provider=...RewardWidgetProvider`, `views=android.widget.RemoteViews`를 확인했다.
- Android UI hierarchy probe: `.omo/evidence/2026-07-04-widget-home-graph-list-design-live/widget-host-window-compact.xml`에서 `reward_widget_wine_row`, `reward_widget_ingredient_row`, `reward_widget_travel_row`, 각 `ProgressBar`, `와인 -`, `재료 -`, `여행 -` 텍스트가 모두 확인됐다.

## 미검증 항목

- not verified yet: 실제 Android 런처의 위젯 선택 화면 preview와 런처 홈 화면에 배치된 위젯의 픽셀 시각 상태는 아직 확인하지 않았다. 현재 emulator는 fake home이고 `screencap` 결과가 all-black이라 픽셀 screenshot 증거를 만들 수 없다.
- not verified yet: production GitHub Pages 배포는 아직 수행하지 않았다. 현재 worktree에 unrelated dirty file `docs/ai/features/2026-07-04-telegram-newsfeed.md`가 있어 배포 전 리뷰와 커밋 범위 분리가 필요하다.

## 다음 단계

- 상태: `ready_for_review`
- 다음 액션: 슬라이스 2 리뷰에서 Android 위젯 XML/provider 계약, APK 산출물, Settings 링크, cache bust 변경을 검토한다.
