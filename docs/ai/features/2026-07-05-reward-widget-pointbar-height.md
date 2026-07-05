# 리워드 위젯 포인트바 높이 보정 계획

## 요청

Android 홈 위젯에서 전체 위젯 높이만 커지고, `와인`, `재료`, `여행` 포인트바 자체 높이와 두께가 1.5배로 커지지 않는 문제를 수정한다.

## 진단

- 현재 로컬 `android/res/layout/reward_widget.xml`의 포인트 row 높이는 `18dp`다.
- 직전 기준 diff의 row 높이는 `16dp`였으므로 1.5배 목표는 `24dp`다.
- row 안의 원형 mark는 직전 `13dp` 기준 1.5배 반올림 목표가 `20dp`다.
- 1차 실행 후 사용자 피드백상 실제 화면에서는 "전체 높이만 넓어지고 포인트바 두께는 그대로"였다.
- 원인 보강: Android horizontal `ProgressBar`는 row가 커져도 intrinsic track/drawable 높이를 유지할 수 있으므로 `layout_height="match_parent"`만으로는 두께 보장이 부족하다.
- 최종 목표는 row `24dp`, mark `20dp x 20dp`, 각 `ProgressBar` `minHeight/maxHeight=24dp`, `reward_widget_progress.xml` background/progress shape `size height=24dp`를 모두 만족하는 것이다.

## 가설

1. `reward_widget_info.xml`의 위젯 높이만 커졌고 row height가 1.5배로 커지지 않았다.
   - 확인값: row `layout_height`가 `24dp`가 아니면 참.
2. mark 크기와 내부 패딩이 기존 얇은 row 기준으로 남아 포인트바가 시각적으로 얇게 보인다.
   - 확인값: mark width/height가 `20dp`가 아니면 참.
3. APK cache/version 토큰이 이전 변경에 묶여 새 Android 리소스가 배포/다운로드되지 않을 수 있다.
   - 확인값: `android/apk-version.json`과 `app.js` settings import cacheBust가 새 토큰과 일치하지 않으면 참.
4. `ProgressBar`와 progress drawable 자체 높이가 고정되지 않아 row만 커지고 실제 bar fill은 얇게 렌더링된다.
   - 확인값: `reward_widget_*_progress`에 `minHeight/maxHeight=24dp`가 없거나 `reward_widget_progress.xml`에 `<size android:height="24dp" />`가 없으면 참.

## 실행 범위

- `android/res/layout/reward_widget.xml`
- `android/apk-version.json`
- `app.js`
- `index.html`
- `scripts/verify-project.mjs`
- 필요한 실행/리뷰 문서와 `docs/ai/NEXT_ACTION.md`

## 제외 범위

- 포인트 계산, Firestore 데이터, Gmail/Telegram/newsfeed 변경
- 위젯 구조 재설계
- 운영 배포/푸시

## 검증

1. RED: `scripts/verify-project.mjs`가 `24dp` row, `20dp` mark, `ProgressBar minHeight/maxHeight=24dp`, drawable `size height=24dp` 계약을 요구하도록 바꾼 뒤, 기존 레이아웃에서 `npm.cmd run verify`가 실패해야 한다.
2. GREEN: Android 레이아웃/drawable과 cacheBust를 수정한 뒤 `npm.cmd run verify`가 통과해야 한다.
3. 시각 보조 증거: XML과 APK dump를 기준으로 row/progress/drawable이 모두 `24dp`임을 `.omo/evidence/2026-07-05-widget-pointbar-height-v3/` 아래 JSON/PNG/dump로 남긴다.
4. 회귀: `npm.cmd run pages:build`를 실행한다. `npm.cmd run apk:build`는 Android SDK가 있으면 실행하고, 없으면 정확한 환경 차단 사유를 기록한다.

## 승인 상태

- 사용자 요청이 `fix` 성격이고 `omo:ulw-loop`로 증거 기반 실행을 명시했으므로, 이 계획의 Slice 1을 같은 세션에서 바로 실행한다.
