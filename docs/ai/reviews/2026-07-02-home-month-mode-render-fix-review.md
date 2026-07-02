# 홈 이번 달 전환 렌더 모드 고정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- 실행: `docs/ai/executions/2026-07-02-home-month-mode-render-fix.md`
- 주요 변경 파일:
  - `render-report.js`
  - `render-home.js`
  - `styles/50-cart-detail.css`
  - `styles/60-urge.css`
  - `style.css`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈: 없음
- 홈 모드 버튼은 공유 `STATE.rootSelector`/`STATE.homeMode`에 의존하지 않고, 클릭 시 홈 렌더 컨텍스트를 직접 전달한다.
- 리포트 탭 버튼도 같은 helper를 쓰지만 `#tab-report`, `homeMode=false`를 직접 전달하므로 기존 리포트 흐름과 분리된다.
- CSS로 리포트 마크업을 숨기는 방식이 아니라 잘못된 마크업이 홈에 렌더링되는 원인을 줄였다.
- `report-body`는 더 이상 중복 id가 아니며, `renderReport()`는 현재 root 내부의 `[data-report-body]`만 갱신한다. 홈/리포트 본문이 서로 덮어쓰는 문제가 줄어든다.
- 홈 진입 경로인 `render-home.js`도 새 `render-report.js` query를 사용하므로 홈이 이전 renderer를 가져오지 않는다.
- 월 MAX 게이지는 오래된 `width:100%` 회귀를 뒤쪽 CSS에서 `width:auto`로 덮어 좌우 margin이 카드 폭에 더해지지 않게 했다.
- 게이지 내부 body/track에 `min-width:0`, `max-width:100%`를 부여해 긴 금액 표시가 행 폭 계산을 밀지 않게 했다.

## 검증 확인

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 산출물에서 새 cache bust, 렌더 컨텍스트 전달 로직, `[data-report-body]`, 게이지 row 폭 보정 CSS 확인.

## 남은 리스크

- 발견된 차단 이슈 없음.
- 운영 확인 완료:
  - Pages legacy build `1075139314`가 commit `0494d1d0d3f5fd9bc88d1c5682f9ab3f9dfde93a`로 `built`.
  - 운영 URL에서 새 `app.js`/`style.css` cache bust 로드 확인.
  - 홈 `이번 달` 전환 후 홈 카드/홈 문구 유지 확인.
  - 리포트 `월 MAX 게이지` 렌더 및 오른쪽 overflow 없음 확인.
- 주의: Actions run `28590074949`의 deploy job은 이전 Pages deployment와 충돌해 실패했지만, GitHub Pages legacy build는 같은 commit으로 완료되어 운영 URL 검증을 통과했다.
