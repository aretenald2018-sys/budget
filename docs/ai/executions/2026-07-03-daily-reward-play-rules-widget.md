# 오늘 카드 보상 루프 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-daily-reward-play-rules-widget.md`
- 실행 슬라이스: 일일 룰 엔진, 홈/설정 UI, Android 위젯 snapshot/provider, 목업 보완
- 실행 일시: 2026-07-03

## 구현 내용

- `utils/reward-savings.js`
  - 기존 포인트별 고정 적립률은 유지했다.
  - `dailyReward` 설정을 받아 `focusPoint` 오늘 카드 선택 시 선택한 포인트 항목에만 보너스를 더한다.
  - 각 bucket에 `todayBasePoints`, `todayBonusPoints`, `todayPoints`를 분리해 UI와 위젯이 설명 가능한 값을 받게 했다.
  - `buildRewardWidgetSnapshot()`을 `schemaVersion: 2`로 올리고 `dailyReward`, `ruleBonusPoints`를 포함했다.
- `data.js`
  - `rewardSavings.dailyReward` 기본값과 정규화를 추가했다.
  - 선택일, 선택 룰, 집중 포인트, 보너스율, 하루 보너스 한도, 쉬어가기권, 스트릭, 티어명을 저장 가능하게 했다.
- `render-report.js`
  - 홈 `오늘의 적립` 카드 안에 `오늘 카드` 선택 영역을 추가했다.
  - 선택 전에는 와인구매/고급재료/여행충당 집중 카드 3개를 `data-reward-daily-focus` 버튼으로 보여준다.
  - 선택 후에는 `고급재료 집중`, `추가 +800P`, `연속 적립`, `쉬어가기권`, 티어를 보여준다.
  - 선택 저장은 `getAppSettings()`와 `saveAppSettings()`를 통해 처리한다.
- `render-settings.js`
  - 설정에 `오늘 카드` 사용, 추가 적립률, 하루 보너스 한도, 쉬어가기권 입력을 추가했다.
  - 기존 선택 상태를 hidden field로 보존해 설정 저장 시 오늘 선택이 사라지지 않게 했다.
- `styles/60-urge.css`
  - 홈 오늘 카드, 선택 버튼, 보너스 진행 상태, 설정 오늘 카드 블록을 반응형으로 스타일링했다.
- Android 위젯
  - `RewardWidgetStore.java`가 schema v2 snapshot, `dailyReward`, `todayBasePoints`, `todayBonusPoints`를 보존한다.
  - `RewardWidgetProvider.java`가 선택된 오늘 카드와 보너스를 compact 문구로 표시한다.
- 캐시 갱신
  - `index.html`, `app.js`, `style.css`, `render-report.js`, `render-settings.js` 및 `data.js`를 가져오는 모듈의 query string을 `20260703-daily-reward-loop`로 맞췄다.
- 목업
  - `docs/ai/features/2026-07-03-daily-reward-to-be-mockup.html`의 비직관적 영어/개발자 용어를 한국어 상품 문구 중심으로 정리했다.

## 검증

- RED:
  - `.omo/evidence/2026-07-03-daily-reward-loop/red-verify.txt`
  - daily reward rule, settings/home token, widget snapshot/provider contract가 없는 상태로 실패함을 확인했다.
- GREEN:
  - `npm.cmd run verify`
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop/final-verify.txt`
  - 결과: `verify-project passed (87 JS files checked).`
- Pages build:
  - `npm.cmd run pages:build`
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop/final-pages-build.txt`
  - 결과: `_site` artifact 생성 완료.
- Visual QA:
  - 실제 `render-report.js`와 실제 CSS를 짧은 로컬 QA harness에 올리고 `data.js`만 stub 처리했다.
  - 모바일 390px에서 선택 전 카드 3개, `premiumIngredients` 선택 후 `고급재료 집중`, `ruleBonusPoints: 800`, `schemaVersion: 2`, overflow 0 확인.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-daily-reward-before.png`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-daily-reward-after.png`
  - 설정 화면 모바일/데스크톱에서 `오늘 카드` 설정, `dailyRewardEnabled`, `dailyRewardBonusCap`, `쉬어가기권`, overflow 0, console error 0 확인.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-daily-reward-mobile.png`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-daily-reward-desktop.png`
- 리뷰 게이트 보정:
  - 1차 게이트에서 `render-home.js`가 예전 `render-report.js?v=20260703-reward-point-goals`를 import하는 stale cache-bust 문제를 발견했다.
  - `render-home.js`를 `20260703-daily-reward-loop`로 갱신했고, `scripts/verify-project.mjs`가 이 경로를 검사하도록 추가했다.
  - 보정 후 `npm.cmd run verify`, `npm.cmd run pages:build`를 다시 통과했다.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/final-verify-after-gate.txt`
    - `.omo/evidence/2026-07-03-daily-reward-loop/final-pages-build-after-gate.txt`
  - 실제 홈 엔트리포인트인 `renderHome()` 경유 QA도 추가했다.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-entrypoint-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-entrypoint.png`

## 미검증 또는 차단

- `npm.cmd run apk:build`는 로컬 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 실패했다.
- 증거: `.omo/evidence/2026-07-03-daily-reward-loop/apk-build.txt`
- Android Java 실제 APK 컴파일은 Android SDK가 있는 환경 또는 GitHub Actions에서 추가 확인이 필요하다.
- production 배포/운영 UI 확인은 아직 수행하지 않았다. 커밋/푸시와 GitHub Pages workflow 확인이 필요하다.
