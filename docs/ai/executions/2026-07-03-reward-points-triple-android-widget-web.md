# 포인트 3분화 웹 슬라이스 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 슬라이스: 슬라이스 1 `웹 포인트 3분화와 홈 이번 달 CSS 복구`
- 실행 일시: 2026-07-03 KST

## 구현

- 포인트 산식 3분화
  - `utils/reward-savings.js`가 `pointRates.winePurchase`, `pointRates.premiumIngredients`, `pointRates.travelFund`를 독립 계산한다.
  - 기존 `allocationRate`는 `winePurchase` fallback/alias로 유지했다.
  - `dailyPointCap`, `monthPointCap`, `120,000` 상한 계산을 제거했다.
  - 반환값에 `pointBuckets`를 추가하고 legacy `todayPoints`, `monthPoints`, `projectedMonthPoints`는 와인구매 포인트 alias로 남겼다.

- 설정 화면
  - `render-settings.js`의 `보상 적립` 폼에서 단일 `적립 배분율`, `일 상한`, `월 상한`을 제거했다.
  - `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트` 적립률 입력을 추가했다.
  - `data.js`의 `appSettings.rewardSavings` 정규화가 legacy 단일 적립률을 `pointRates.winePurchase`로 마이그레이션한다.

- 홈 카드
  - `render-report.js`의 `오늘의 적립` 카드가 세 포인트 버킷을 각각 표시한다.
  - 상한 대비 progress bar와 `포인트 n / 120,000` 형식을 제거하고 `상한 없음`, `오늘`, `이번 달`, `월 예상`, `적립률` 중심으로 표시한다.

- 홈 `이번 달` CSS 깨짐 복구
  - 중복 `id="report-body"`를 제거하고 root-scoped `[data-report-body]`를 사용한다.
  - `reportModeControlHtml()`의 inline `window.reportViewMode()` 호출을 `data-report-view-mode` delegation으로 바꿨다.
  - 클릭된 root의 `data-report-home-mode`와 `data-report-root-selector`로 다시 렌더해 홈에서 `이번 달`을 눌러도 report 모드 문구/CSS로 오염되지 않게 했다.
  - `.report-body` class를 실제 DOM에 추가해 홈 CSS가 적용되게 했다.

- 캐시 일관성
  - `data.js`, `render-report.js`, `render-settings.js`, `render-home.js`, `style.css`, `modal-manager.js`, data import를 쓰는 렌더/모달/urge 모듈의 query string을 `20260703-reward-points-triple`로 맞췄다.
  - repo root에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`은 없어 service worker cache bump 대상은 없다.

- 검증 계약
  - `scripts/verify-project.mjs`의 canonical data module version을 갱신했다.
  - `checkRewardSavingsTriplePointSmoke()`를 추가해 세 포인트 버킷, 상한 제거, 설정/리포트 문자열 계약을 검증한다.

## 검증

- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node --check .\render-report.js; node --check .\render-settings.js; node --check .\utils\reward-savings.js; node --check .\data.js; node --check .\scripts\verify-project.mjs`
  - 통과.
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 산출물 검색
  - `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`, `상한 없음`, `data-report-view-mode`, `20260703-reward-points-triple` 반영 확인.
  - runtime 파일 기준 `120,000`, `120000`, `월 상한`, `일 상한`, `monthPointCap`, `dailyPointCap`, inline `onclick="window.reportViewMode` 없음 확인.
- `git diff --check`
  - 통과.
- production 배포/운영 UI 확인
  - 커밋: `c5ebb89` (`Split reward points into three buckets`)
  - `Validate` workflow 성공: run `28647915715`
  - `Deploy GitHub Pages` workflow 성공: run `28647915721`
  - 운영 URL `https://aretenald2018-sys.github.io/budget/` HTTP 200 확인.
  - 운영 `index.html`에 `20260703-reward-points-triple` cache-bust 반영 확인.
  - 운영 홈에서 `오늘의 적립` 카드에 `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`, `상한 없음` 표시 확인.
  - 운영 홈에서 `이번 달` 버튼 클릭 후 `#tab-home` root-scoped 렌더, 월 보기 active 상태, 세 포인트 표시, 상한 문구 없음 확인.
  - 운영 설정 화면에서 `pointRate:winePurchase`, `pointRate:premiumIngredients`, `pointRate:travelFund` 세 입력과 상한 입력 제거 확인.

## 미검증

- Android 실기기/위젯 검증은 아직 하지 않았다. 다음 슬라이스에서 snapshot bridge부터 구현한다.

## 변경 파일

- `app.js`
- `data.js`
- `index.html`
- `modal-manager.js`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `render-finance.js`
- `render-home.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `scripts/verify-project.mjs`
- `style.css`
- `styles/60-urge.css`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `utils/reward-savings.js`
- `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- `docs/ai/executions/2026-07-03-reward-points-triple-android-widget-web.md`
- `docs/ai/NEXT_ACTION.md`

## 다음 액션

- 웹 슬라이스는 운영 배포/운영 UI 확인까지 완료했다.
- 다음 슬라이스는 Android 위젯 snapshot bridge다.
