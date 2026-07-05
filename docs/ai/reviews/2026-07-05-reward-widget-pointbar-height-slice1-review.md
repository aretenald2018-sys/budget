# 리워드 위젯 포인트바 높이 보정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-05-reward-widget-pointbar-height.md`
- 실행: `docs/ai/executions/2026-07-05-reward-widget-pointbar-height-slice1.md`
- 주요 파일:
  - `android/res/layout/reward_widget.xml`
  - `android/apk-version.json`
  - `app.js`
  - `index.html`
  - `render-settings.js`
  - `scripts/verify-project.mjs`

## 결과

- 1차 코드/QA/Visual 리뷰: PASS였으나 사용자 실사용 피드백으로 불충분 판정.
- 보완 원인: row/mark만 키우고 `ProgressBar` intrinsic/drawable thickness를 직접 고정하지 않아 실제 bar fill이 얇게 남을 수 있었다.
- 보완 리뷰: `scripts/verify-project.mjs`에 progress min/max height와 drawable size 계약을 추가했고, RED/GREEN과 APK dump로 통과 확인.
- Gate 리뷰 1차: BLOCK
  - RED artifact가 GREEN으로 덮였고, 리뷰 보고서 파일과 상태 문서가 아직 완료 상태가 아니었다.
- Gate 보완:
  - `.omo/evidence/2026-07-05-widget-pointbar-height/npm-verify-red.txt` 추가
  - `.omo/evidence/2026-07-05-widget-pointbar-height/code-review.md` 추가
  - review 문서와 `NEXT_ACTION.md` 완료 상태 반영

## 확인한 동작

- `reward_widget_*_row`: `24dp`
- `reward_widget_*_mark`: `20dp x 20dp`
- `reward_widget_*_progress`: `layout_height="match_parent"`, `minHeight="24dp"`, `maxHeight="24dp"`
- `reward_widget_progress.xml`: background/progress shape 모두 `android:height="24dp"`
- 포인트바 stack: `76dp`
- APK version/cacheBust: `v2.1.6/17`, `20260705-reward-widget-pointbar-thickness-v3`

## 검증 증거

- RED: `npm.cmd run verify` failed on three missing ProgressBar `minHeight/maxHeight` contracts and missing two drawable `24dp` sizes.
- GREEN verify: `npm.cmd run verify` passed with `verify-project passed (95 JS files checked).`
- APK build: `npm.cmd run apk:build` produced `public/downloads/budget.apk`, `v2.1.6/17`.
- Pages build: `npm.cmd run pages:build` produced `_site`.
- Geometry: `.omo/evidence/2026-07-05-widget-pointbar-height-v3/widget-geometry.json`
- APK layout dump: `.omo/evidence/2026-07-05-widget-pointbar-height-v3/apk-layout-dump.txt`
- APK drawable dump: `.omo/evidence/2026-07-05-widget-pointbar-height-v3/apk-progress-drawable-dump.txt`
- Visual artifact: `.omo/evidence/2026-07-05-widget-pointbar-height-v3/widget-proof.png`

## 남은 제한

- 사용자가 실물폰 검증은 필요 없다고 명시했다.
- 에뮬레이터 런처 검증은 fake black launcher 때문에 제외했다.
- worktree에 unrelated dirty changes가 많아 production commit/push/deploy는 not verified yet이다.
