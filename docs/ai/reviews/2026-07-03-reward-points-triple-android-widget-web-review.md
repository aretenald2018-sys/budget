# 포인트 3분화 웹 슬라이스 리뷰

## 기준

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 문서: `docs/ai/executions/2026-07-03-reward-points-triple-android-widget-web.md`
- 리뷰 대상: 슬라이스 1 `웹 포인트 3분화와 홈 이번 달 CSS 복구`

## findings

- 발견된 코드 결함 없음.

## 확인한 내용

- 기존 `allocationRate`는 `pointRates.winePurchase` fallback/alias로 유지되어 legacy 설정이 와인구매 포인트로 이어진다.
- `utils/reward-savings.js` 계산 결과에서 `dailyPointCap`, `monthPointCap`를 제거했고 세 포인트 bucket을 독립 계산한다.
- `render-settings.js` 설정 폼은 `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트` 적립률 입력을 제공하고 `일 상한`, `월 상한` 입력을 제거했다.
- `render-report.js`는 중복 `#report-body` 대신 root-scoped `[data-report-body]`를 사용한다.
- `이번 2주`/`이번 달` 버튼은 inline `window.reportViewMode()`가 아니라 클릭된 root의 `data-report-home-mode` 기준으로 재렌더된다.
- `data.js` query string canonical 값과 browser data import가 `20260703-reward-points-triple`로 맞춰졌다.
- service worker 파일은 없어 `CACHE_VERSION` bump 대상은 없다.

## 검증 확인

- `node --check` 대상:
  - `render-report.js`
  - `render-settings.js`
  - `utils/reward-savings.js`
  - `data.js`
  - `scripts/verify-project.mjs`
- `npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` 생성 완료.
- runtime 파일과 `_site` 주요 파일 검색:
  - 세 포인트 라벨, `상한 없음`, `data-report-view-mode`, `20260703-reward-points-triple` 반영 확인.
  - `120,000`, `120000`, `월 상한`, `일 상한`, `monthPointCap`, `dailyPointCap`, inline `onclick="window.reportViewMode` 없음 확인.
- `git diff --check`
  - 통과.

## residual risk

- production GitHub Pages 배포와 운영 URL 실제 UI 클릭 검증은 아직 미완료다.
- 이 리뷰는 로컬 소스, verify, Pages artifact 기준이며, 운영 URL에서 홈 `이번 달` 클릭과 설정 저장 흐름은 배포 후 확인해야 한다.

## 결론

- 슬라이스 1은 리뷰 기준으로 통과.
- 다음 액션은 의도한 변경을 production에 배포하고 운영 UI에서 세 포인트 표시, 상한 제거, 홈 `이번 달` 클릭 상태를 확인하는 것이다.
