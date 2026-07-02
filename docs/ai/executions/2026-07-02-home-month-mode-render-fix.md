# 홈 이번 달 전환 렌더 모드 고정 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-02-home-month-mode-and-gauge-overflow.md`
- 실행 슬라이스: 실행 슬라이스 1 - 홈 모드 버튼 렌더 대상, report body scope, 월 MAX 게이지 폭 고정
- 실행 일시: 2026-07-02 KST

## 구현

- `render-report.js`
  - `reportModeControlHtml()`이 홈 모드 여부에 따라 명시적인 `rootSelector`와 `homeMode` 값을 버튼 핸들러에 전달하게 했다.
  - 홈의 `이번 2주`/`이번 달` 버튼은 항상 `#tab-home`, `homeMode=true`로 다시 렌더링된다.
  - 리포트 탭 버튼은 기존처럼 `#tab-report`, `homeMode=false`로 렌더링된다.
  - `window.reportViewMode()`는 전달받은 렌더 컨텍스트를 우선 사용하고, 인자가 없을 때만 기존 `STATE`를 fallback으로 사용한다.
  - 중복 `id="report-body"`를 `.report-body[data-report-body]`로 바꾸고, 본문 갱신 대상을 현재 `root` 안으로 스코프했다.
- `app.js`, `render-home.js`, `index.html`
  - 새 JS가 운영에서 로드되도록 cache-busting query를 `20260702-report-body-scope-fix`로 갱신했다.
  - 홈 렌더 경로인 `render-home.js`도 같은 버전의 `render-report.js`를 import하게 했다.
- `styles/50-cart-detail.css`, `styles/60-urge.css`, `style.css`, `index.html`
  - 홈 report body 관련 CSS selector를 `.report-body` 기준으로 바꿨다.
  - `20-records.css`의 기존 `.budget-gauge-row.actionable { width: 100%; }`가 월 MAX 게이지 행에 남지 않도록 `width:auto`, `box-sizing:border-box`, `min-width:0`를 명시했다.
  - 게이지 내부 body/track의 최대 폭을 카드 안으로 제한했다.
  - 새 CSS가 운영에서 로드되도록 `style.css`, `styles/50-cart-detail.css`, `styles/60-urge.css` cache-busting query를 `20260702-report-body-scope-fix`로 갱신했다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 확인
  - `style.css?v=20260702-report-body-scope-fix` 반영 확인.
  - `styles/50-cart-detail.css?v=20260702-report-body-scope-fix` 반영 확인.
  - `styles/60-urge.css?v=20260702-report-body-scope-fix` 반영 확인.
  - `app.js?v=20260702-report-body-scope-fix` 반영 확인.
  - `render-home.js?v=20260702-report-body-scope-fix` 반영 확인.
  - `render-report.js?v=20260702-report-body-scope-fix` 반영 확인.
  - `_site/render-report.js`에 홈/리포트 버튼별 명시적 `rootSelector`/`homeMode` 전달 로직 반영 확인.
  - `_site/render-report.js`에서 `id="report-body"`가 제거되고 `[data-report-body]`가 반영된 것 확인.
  - `_site/styles/60-urge.css`에 월 MAX 게이지 row `width:auto`, `box-sizing:border-box`, `min-width:0` 반영 확인.

## 운영 확인

- 커밋:
  - `dc5bea3` Fix home month mode and gauge overflow
  - `ea126ee` Scope report body rendering
  - `0494d1d` Refresh home report import
- Pages:
  - GitHub Pages legacy build `1075139314`가 commit `0494d1d0d3f5fd9bc88d1c5682f9ab3f9dfde93a`로 `built` 완료.
  - Actions run `28590074949`는 Pages 내부 deployment 충돌로 deploy job은 실패했지만, legacy Pages build가 같은 commit으로 `built` 완료됐고 운영 URL에서 새 asset query를 확인했다.
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
- 운영 확인:
  - `index.html`에서 `app.js?v=20260702-report-body-scope-fix`, `style.css?v=20260702-report-body-scope-fix` 로드 확인.
  - 홈 DOM에서 중복 `#report-body` 0개, `[data-report-body]` 사용 확인.
  - 홈 `이번 달` 클릭 후 active button은 `이번 달`, `.home-hero-card.monthly`가 보이고 `지출 합계`/`장기 방향` 문구가 홈에 섞이지 않음.
  - 리포트 탭에서 `월 MAX 게이지` 본문이 스피너 없이 렌더링됨.
  - `월 MAX 게이지`의 주요 행 12개 기준 row/value/meta/track 오른쪽 overflow와 scroll overflow가 모두 없음.

## 변경 파일

- `render-report.js`
- `render-home.js`
- `styles/50-cart-detail.css`
- `styles/60-urge.css`
- `style.css`
- `app.js`
- `index.html`
- `docs/ai/diagnoses/2026-07-02-home-month-mode-and-gauge-overflow.md`
- `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- `docs/ai/executions/2026-07-02-home-month-mode-render-fix.md`
- `docs/ai/NEXT_ACTION.md`
