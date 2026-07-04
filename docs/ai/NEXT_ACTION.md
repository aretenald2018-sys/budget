# 다음 자동 액션

## 현재 상태

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 목업 문서: 없음
- 실행 문서: `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice2.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-review.md`
- 현재 단계: 슬라이스 1-3 실행 및 리뷰 완료, 외부 검증/배포 결정 대기
- 마지막 완료: 웹 홈 그래프와 Android 위젯이 모두 2번 사진의 목록형 widget row 구조로 변경됐다. 사용자 피드백으로 확인된 와인구매 낮은 비율 fill 미노출을 수정했고, APK/설정 업데이트 경로를 v2.1.3/14로 올렸다. Edge headless fill harness, APK v2.1.3/14 빌드, Android emulator install/package probe, custom `AppWidgetHost` RemoteViews hierarchy probe, `npm.cmd run verify`, `npm.cmd run pages:build`가 통과했다.
- 다음 액션: 사용자 결정 후 production commit/push 배포 또는 Android launcher 위젯 실기기 QA
- 차단 사유: commit/push는 사용자의 명시적 요청이 필요하다. production은 아직 `v2.1.1/12`와 `20260703-daily-reward-loop` asset을 내려준다. 현재 emulator는 `com.android.fakesystemapp/.launcher.EmptyHomeActivity` fake launcher이고 `screencap`이 all-black이라 실제 launcher preview/home widget 픽셀 QA 증거를 만들 수 없다.

## 최근 처리한 요청

- 요청: `/goal 가계부 앱 위젯 디자인 및 홈탭 내에서 렌더링되는 그래프를 2사진의 디자인 느낌으로 변경(색을 바꾸라는 의미는 아님)`
- 계획 문서: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 목업 문서: 없음
- 실행 문서: `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice2.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-review.md`
- 결과:
  - 슬라이스 1은 리뷰 통과.
  - `docs/design-system.md`의 `목록형 위젯 그래프` primitive와 웹 홈 구현이 일치한다.
  - 슬라이스 2는 실행 및 리뷰 통과.
  - 슬라이스 3 최종 디자인/기능 리뷰 완료.
  - Android 위젯의 세 포인트 버킷이 rounded row + progress bar + label/value overlay 구조로 변경됐다.
  - `RewardWidgetProvider`가 `monthPoints`, `targetAmount`, `todayBonusPoints`, `focusBucketKey`를 사용해 row 진행률과 bonus label을 채운다.
  - APK 산출물은 v2.1.3/14로 갱신됐다.
  - 설정 화면 하단 `Android APK 다운로드` 버튼은 `20260704-widget-graph-fill-v14` APK cache bust를 사용하고, 버전 표시는 `v2.1.3 · Android APK`로 갱신됐다.
  - `style.css`, `index.html`, `app.js`, `render-home.js`, `scripts/verify-project.mjs`의 cache-bust/검증 계약이 `20260704-widget-graph-fill-v14`로 맞춰졌다.
  - `render-report.js`/`styles/60-urge.css`에서 홈탭 row fill을 `--fill-pct` 기반으로 바꾸고 `.has-progress` 최소 표시 폭을 추가해 `와인구매 15%` 같은 낮은 비율도 보라색 fill이 보이게 했다.
  - `git diff --check`, changed JS `node --check`, `npm.cmd run apk:build`, `npm.cmd run verify`, `npm.cmd run pages:build` 통과.
  - APK 내부에 새 `reward_widget_*` layout/drawable/xml 리소스가 포함된 것을 확인했다.
  - Edge headless harness `.omo/evidence/2026-07-04-widget-graph-fill-fix/home-graph-fill-harness.png`에서 `와인구매 15%` row fill이 보이는 것을 확인했다.
  - fresh Playwright QA harness에서 340px/390px/430px, `이번 2주`/`이번 달` 상태의 row overflow 없음, console error 없음, preview size text 미노출을 확인했다.
  - API 35 emulator에 APK를 update-install했고 installed package metadata가 v2.1.2/13 및 `RewardWidgetProvider` receiver를 가리키는 것을 확인했다. v2.1.3/14 APK는 빌드까지 확인했으며 production 설치 QA는 배포 후 필요하다.
  - custom Android `AppWidgetHost`에 `RewardWidgetProvider`를 바인딩했고, UI hierarchy에서 `reward_widget_wine_row`, `reward_widget_ingredient_row`, `reward_widget_travel_row`, 각 `ProgressBar`, `와인 -`, `재료 -`, `여행 -` 텍스트를 확인했다.
  - not verified yet: production Pages 배포는 아직 수행하지 않았다. 현재 worktree에 unrelated dirty file이 있어 안전한 push/deploy 대상 분리가 필요하다.
  - not verified yet: 실제 Android 런처의 위젯 선택 화면 preview와 런처 홈 화면에 배치된 위젯의 픽셀 시각 상태는 아직 확인하지 않았다. 현재 emulator는 fake empty home이고 `screencap` 결과가 all-black이다.
  - not verified yet: Android 앱 `MainActivity`는 focus/launch는 확인됐지만 production URL을 로드하는 WebView screenshot이 black으로 캡처되어, production 배포 전 Android 앱 화면으로 새 홈 UI를 확인할 수 없다.

## 다음 실행 범위

- 실행할 단계: 사용자 결정 필요
- 결정할 항목:
  - 의도한 변경 파일만 commit/push해 production GitHub Pages 배포를 진행할지 여부
  - 실제 launcher와 정상 screenshot capture가 가능한 Android emulator/실기기에서 launcher widget preview와 홈 화면 widget 픽셀 QA를 진행할 수 있는지 여부
- 수정하지 말 것:
  - 새 디자인/기능 추가
  - 웹 홈 그래프 추가 리디자인
  - Android notification/SMS ingest service
  - 위젯의 Firestore/HTTP/Gemini/Firebase/Gmail secret 직접 조회

## 리뷰 대상 변경 파일

- `docs/design-system.md`
- `render-report.js`
- `styles/60-urge.css`
- `style.css`
- `index.html`
- `app.js`
- `render-home.js`
- `scripts/verify-project.mjs`
- `android/res/layout/reward_widget.xml`
- `android/res/drawable/reward_widget_mark_background.xml`
- `android/res/drawable/reward_widget_preview.xml`
- `android/res/drawable/reward_widget_progress.xml`
- `android/res/drawable/reward_widget_row_background.xml`
- `android/res/xml/reward_widget_info.xml`
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `android/apk-version.json`
- `render-settings.js`
- `public/downloads/budget.apk`
- `public/downloads/budget-apk.json`
- `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice1.md`
- `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice2.md`
- `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-slice1-review.md`
- `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-slice2-review.md`
- `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-review.md`
- `docs/ai/NEXT_ACTION.md`

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 "계속", "다음", "진행", "리뷰해", "해줘"처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.
