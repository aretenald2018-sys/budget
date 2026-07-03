# 오늘 카드 보상 루프 리뷰

## 결론

- 결과: 통과
- 커밋:
  - `ec88a44 Add daily reward card loop`
  - `087626e Update Pages deploy action`
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`

## 검증 결과

- 로컬 검증:
  - `npm.cmd run verify` 통과.
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop/final-verify-after-gate.txt`
- Pages 빌드:
  - `npm.cmd run pages:build` 통과.
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop/final-pages-build-after-gate.txt`
- Actions 검증:
  - `Validate` workflow 성공.
  - URL: `https://github.com/aretenald2018-sys/budget/actions/runs/28667221771`
  - `Deploy GitHub Pages` workflow 성공.
  - URL: `https://github.com/aretenald2018-sys/budget/actions/runs/28667221806`
  - Actions 환경에서 `Build Android APK`, `Verify`, `Build Pages artifact`, `Deploy to GitHub Pages`가 모두 통과했다.
- 운영 반영 확인:
  - `https://aretenald2018-sys.github.io/budget/` HTTP 200.
  - `render-home.js?v=20260703-daily-reward-loop` HTTP 200, stale `render-report.js?v=20260703-reward-point-goals` import 없음.
  - `render-report.js?v=20260703-daily-reward-loop` HTTP 200, `data-reward-daily-focus` 포함.
  - `render-settings.js?v=20260703-daily-reward-loop` HTTP 200, `dailyRewardEnabled` 포함.
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop/production-deploy-check.json`
- Visual QA:
  - 실제 `renderHome()` 진입점에서 오늘 카드 3개, overflow 0, widget snapshot schema 2 확인.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-entrypoint-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-entrypoint.png`
  - 홈 `render-report.js` 직접 QA에서 `premiumIngredients` 선택 후 `고급재료 집중`, `ruleBonusPoints: 800`, schema v2 확인.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-home-daily-reward-after.png`
  - 설정 화면 모바일/데스크톱에서 `오늘 카드`, `dailyRewardEnabled`, `dailyRewardBonusCap`, `쉬어가기권`, overflow 0 확인.
  - 증거:
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-qa.json`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-daily-reward-mobile.png`
    - `.omo/evidence/2026-07-03-daily-reward-loop/visual-settings-daily-reward-desktop.png`

## 리뷰 게이트 반영

- 1차 게이트 지적:
  - `render-home.js`가 stale `render-report.js?v=20260703-reward-point-goals`를 import해 실제 홈 진입점에서 새 구현을 놓칠 수 있었다.
- 조치:
  - `render-home.js`를 `render-report.js?v=20260703-daily-reward-loop`로 갱신했다.
  - `scripts/verify-project.mjs`에 `render-home.js` cache-bust 검사를 추가했다.
  - `_site/render-home.js`도 재빌드 후 새 버전 문자열을 확인했다.
- 배포 게이트 지적:
  - `actions/deploy-pages@v4`가 Node 24 강제 실행 환경에서 Pages deploy status 실패를 냈다.
- 조치:
  - `.github/workflows/pages.yml`을 `actions/deploy-pages@v5`로 갱신했다.
  - 갱신 후 `Deploy GitHub Pages` workflow가 성공했다.

## 보안/품질 리뷰

- 코드 품질 리뷰: 통과.
  - 증거: `.omo/evidence/2026-07-03-daily-reward-loop-code-review.md`
- 보안 리뷰: 통과.
  - 동적 텍스트는 escape 또는 숫자 정규화 경로를 탄다.
  - Firestore 쓰기는 `saveAppSettings()`와 `data.js` 정규화를 통해 이뤄진다.
  - Android 위젯은 app-private `SharedPreferences` snapshot만 쓰며 새 네트워크/secret 경로를 추가하지 않았다.

## 남은 확인

- production에서 로그인된 실제 사용자 홈 카드 클릭은 자동화 세션에 인증 정보가 없어 직접 클릭 검증하지 않았다.
- 대신 운영 JS 모듈 반영, 로컬 실제 `renderHome()` 진입점 QA, Actions의 APK/verify/pages/deploy 성공으로 배포 가능성과 기능 동작을 확인했다.
- Android 실기기 위젯 표시 확인은 별도 기기에서 APK 설치 후 확인해야 한다.
