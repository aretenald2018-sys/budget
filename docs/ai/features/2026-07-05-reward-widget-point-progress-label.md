# Android 위젯 포인트/퍼센트 표시 확대 계획

## 요청 원문

`내 위젯 밑에 있는 위젯처럼 폰트사이즈를 확대해주고, 각각 포인트가 포인트 쌓였는지 퍼센트 왼쪽에 정보표기해줘`

예: `5500p/12%`

후속 요청: `바뀐게 없는거같으니 끝가지 구현할 것`

## 진단 결과

- 적용 트리거: `/diagnose`
- 증상: 사용자가 보기에는 위젯이 바뀌지 않았다.
- 확인한 원인:
  - production `downloads/budget-apk.json`이 아직 `versionName=2.1.3`, `versionCode=14`, `cacheBust=20260704-widget-graph-fill-v14`였다.
  - 로컬 구현은 `v2.1.4/15`였지만 commit/push/Pages 배포가 되지 않아 사용자 다운로드 경로가 여전히 old APK를 제공했다.
- 결론:
  - 소스 구현만으로는 완료가 아니다. production Pages APK metadata와 다운로드 APK까지 갱신되어야 사용자가 변화를 볼 수 있다.

## 목표

- Android `오늘의 적립` 위젯의 세 포인트 row를 더 읽기 쉽게 키운다.
- row 우측 값은 퍼센트만 표시하지 않고 `월누적p/진행률%`로 표시한다.
  - 예: `5,500p/12%`
- Settings의 APK version/download cache-bust와 GitHub Pages 배포 산출물이 새 APK를 가리키게 한다.

## 실행 슬라이스

### Slice 1: 위젯 row 표시/폰트/API 산출물 갱신

- 수정 파일:
  - `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - `android/res/layout/reward_widget.xml`
  - `android/apk-version.json`
  - `render-settings.js`
  - `app.js`
  - `index.html`
  - `scripts/verify-project.mjs`
- 하지 않을 것:
  - `RewardWidgetStore` schema 변경
  - 위젯에서 Firestore/network 직접 조회
  - 뉴스피드/뉴스레터 변경
- 검증:
  - `npm.cmd run apk:build`
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - Android emulator widget host hierarchy에서 `5,500p/12%` 형식과 row bounds 확인
  - commit/push 후 GitHub Pages production metadata가 `2.1.4/15`로 바뀌는지 확인
