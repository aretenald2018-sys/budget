# 리워드 위젯 포인트바 높이 보정 실행 기록

## 범위

- 계획: `docs/ai/features/2026-07-05-reward-widget-pointbar-height.md`
- Slice 1: Android 홈 위젯의 포인트바 row/mark 높이를 1.5배 목표치로 보정한다.

## RED

- 명령: `npm.cmd run verify`
- 증거: `.omo/evidence/2026-07-05-widget-pointbar-height/npm-verify-red.txt`
- 실패 원인:
  - `reward_widget_*_row`가 `24dp`가 아니라 `18dp`
  - `reward_widget_*_mark`가 `20dp x 20dp`가 아니라 `15dp x 15dp`

## 수정

- 2026-07-05 사용자 재피드백: "달라진 게 없는데? 제대로 구현할 것"
  - 1차 수정은 row/mark만 키웠고, Android horizontal `ProgressBar`의 intrinsic drawable 두께를 직접 고정하지 않았다.
  - 같은 slice의 focused fix로 `ProgressBar`와 progress drawable 자체 높이 계약을 추가했다.
- `android/res/layout/reward_widget.xml`
  - `reward_widget_wine_row`, `reward_widget_ingredient_row`, `reward_widget_travel_row`: `24dp`
  - `reward_widget_wine_mark`, `reward_widget_ingredient_mark`, `reward_widget_travel_mark`: `20dp x 20dp`
  - `reward_widget_wine_progress`, `reward_widget_ingredient_progress`, `reward_widget_travel_progress`: `minHeight/maxHeight=24dp`
- `android/res/drawable/reward_widget_progress.xml`
  - background shape와 progress shape 모두 `<size android:height="24dp" />`
- `android/apk-version.json`
  - `versionCode`: `17`
  - `versionName`: `2.1.6`
  - `cacheBust`: `20260705-reward-widget-pointbar-thickness-v3`
- `app.js`, `index.html`, `render-settings.js`
  - APK/settings/app entry cacheBust와 표시 버전을 새 토큰으로 갱신
- `scripts/verify-project.mjs`
  - row/mark/progress XML attribute 직접 검증 추가
  - `reward_widget_progress.xml`의 24dp drawable size 검증 추가

## GREEN

- `npm.cmd run apk:build`
  - 결과: `v2.1.6/17`, `public/downloads/budget.apk`
- `npm.cmd run verify`
  - 결과: `verify-project passed (95 JS files checked).`
- `npm.cmd run pages:build`
  - 결과: `_site` artifact 생성
- APK/시각/기하 증거
  - `.omo/evidence/2026-07-05-widget-pointbar-height-v3/widget-geometry.json`
  - `.omo/evidence/2026-07-05-widget-pointbar-height-v3/apk-layout-dump.txt`
  - `.omo/evidence/2026-07-05-widget-pointbar-height-v3/apk-progress-drawable-dump.txt`
  - `.omo/evidence/2026-07-05-widget-pointbar-height-v3/widget-proof.png`
  - 결과: row `24dp`, progress min/max `24dp`, drawable background/progress size `24dp`, mark `20dp`

## 제한

- 사용자 요청에 따라 실물폰 검증은 제외한다.
- AVD `BudgetNotifApi35`는 fake black launcher라 홈 위젯 배치 화면 검증에는 부적합했다. 대신 APK resource dump와 설치 패키지 metadata로 current APK를 확인했다.
- worktree에 unrelated dirty changes가 많아 production commit/push/deploy는 not verified yet로 남긴다.
