# Android 위젯 포인트/퍼센트 표시 확대 실행

## 변경 내용

- `RewardWidgetProvider`의 row value를 `progress + "%"`에서 `formatNumber(monthPoints) + "p/" + progress + "%"`로 변경했다.
- 위젯 layout의 핵심 글자 크기를 키웠다.
  - title `13sp -> 14sp`
  - updated `10sp -> 11sp`
  - saved `17sp -> 18sp`
  - baseline `8sp -> 9sp`
  - row height `16dp -> 18dp`
  - row label/value `9sp -> 10sp`
  - mark `13dp/8sp -> 15dp/9sp`
- `textAlignment="viewEnd"`를 row value에 추가해 긴 `p/%` 값이 우측 정렬되게 했다.
- Android APK version을 `2.1.4/15`로 올리고 cache-bust를 `20260705-reward-widget-point-progress-label-v1`로 갱신했다.
- Settings APK download link와 `app.js`/`index.html` cache-bust를 갱신했다.
- `verify-project.mjs`가 새 provider/layout/cache-bust 계약을 확인하게 했다.

## 검증

- `npm.cmd run apk:build`: PASS
- `npm.cmd run verify`: PASS
- `npm.cmd run pages:build`: PASS
- GitHub Pages workflow `28729363053`: PASS
- Production `/budget/`: HTTP 200
- Production `downloads/budget-apk.json`: `versionName=2.1.4`, `versionCode=15`, `cacheBust=20260705-reward-widget-point-progress-label-v1`
- Production `render-settings.js`: `v2.1.4 · Android APK`, `budget.apk?v=20260705-reward-widget-point-progress-label-v1`
- Production APK emulator install: `versionCode=15`, `versionName=2.1.4`
- Android emulator widget host hierarchy:
  - `5,500p/12%`
  - `12,000p/24%`
  - `900p/3%`
  - 세 value bounds가 각각 row bounds 안에 있음

## 배포 메모

- 사용자가 “바뀐 게 없다”고 본 직접 원인은 production APK metadata가 old version이었기 때문이다.
- 이 slice는 clean worktree에서 reward-widget 변경만 commit/push해 GitHub Pages workflow가 새 APK와 Pages artifact를 만들게 한다.
