# 위젯/홈 그래프 변경 미노출 진단

## 증상

- 사용자 피드백: "달라진게 없는데? 홈탭에서도 위젯도.."
- 대상:
  - production 홈탭: `https://aretenald2018-sys.github.io/budget/`
  - production APK 다운로드: `https://aretenald2018-sys.github.io/budget/downloads/budget.apk`

## 가설

1. production GitHub Pages가 아직 이전 asset을 배포하고 있다.
2. 브라우저 cache/service worker가 새 query string이 아닌 이전 asset을 유지하고 있다.
3. Android 기기가 이전 APK 또는 이전 위젯 snapshot을 보고 있다.

## 확인한 런타임 증거

- 로컬 `index.html`:
  - `style.css?...reward=20260704-android-widget-list-v13`
  - `app.js?v=20260704-android-widget-list-v13...`
- production `index.html`:
  - `style.css?...reward=20260703-daily-reward-loop`
  - `app.js?v=20260703-daily-reward-loop...`
- production `downloads/budget-apk.json`:
  - `versionCode=12`
  - `versionName=2.1.1`
  - `cacheBust=20260703-reward-widget-provider-v12`
- 로컬 빌드 산출물:
  - 처음 진단 시점: `versionCode=13`, `versionName=2.1.2`, `cacheBust=20260704-widget-home-graph-list-v13`
  - 추가 수정 후: `versionCode=14`, `versionName=2.1.3`, `cacheBust=20260704-widget-graph-fill-v14`
- 홈탭 와인구매 row:
  - 사용자 캡처 기준 `와인구매 포인트`는 `17,480 / 120,000`, 텍스트는 `15%`로 계산됐다.
  - 기존 row-shell 구현은 낮은 비율 fill이 왼쪽 marker 원 뒤에 대부분 가려져 색이 거의 보이지 않았다.
  - `render-report.js`는 `--fill-pct`를 직접 출력하고, `styles/60-urge.css`는 `.has-progress` fill에 최소 표시 폭을 둬 낮은 비율도 라벨 영역까지 보이게 수정했다.
  - Edge headless harness screenshot: `.omo/evidence/2026-07-04-widget-graph-fill-fix/home-graph-fill-harness.png`

## 결론

- 원인 1: 변경 파일이 아직 commit/push되어 production GitHub Pages에 배포되지 않았다.
- 원인 2: 최신 로컬 홈탭 row-shell에서도 낮은 비율 fill이 marker 뒤에 묻혀 와인구매 그래프 색이 충분히 보이지 않았다.
- 따라서 사용자가 production UI나 production APK를 보고 있으면 홈탭과 Android 위젯이 그대로 보이는 것이 정상이고, 최신 로컬 코드에서도 낮은 비율 row는 시각적으로 부족했다.
- 최신 로컬 수정은 `v2.1.3/14`, `20260704-widget-graph-fill-v14` 기준으로 정리됐다.

## 필요한 수정/조치

- 사용자가 명시적으로 승인하면 의도한 변경 파일만 commit/push해 `Deploy GitHub Pages` workflow를 트리거한다.
- 배포 후 production에서 다음을 확인한다.
  - `index.html`이 `20260704-widget-graph-fill-v14` asset query를 내려주는지
  - 설정 하단 `Android APK 다운로드` 버튼의 앱 정보가 `v2.1.3 · Android APK`로 보이는지
  - `downloads/budget-apk.json`이 `versionCode=14`, `versionName=2.1.3`를 내려주는지
  - 홈탭의 `오늘의 적립`/변동비 그래프가 목록형 row 구조로 보이는지
  - `와인구매 15%`처럼 낮은 비율 그래프도 보라색 fill이 라벨 영역까지 보이는지
  - Android에서 새 APK를 설치한 뒤 위젯을 갱신하거나 다시 배치했을 때 `와인`, `재료`, `여행` progress row가 보이는지
