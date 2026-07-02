# 홈 이번 달 전환 렌더 모드 고정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- 실행: `docs/ai/executions/2026-07-02-home-month-mode-render-fix.md`
- 주요 변경 파일:
  - `render-report.js`
  - `styles/60-urge.css`
  - `style.css`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈: 없음
- 홈 모드 버튼은 공유 `STATE.rootSelector`/`STATE.homeMode`에 의존하지 않고, 클릭 시 홈 렌더 컨텍스트를 직접 전달한다.
- 리포트 탭 버튼도 같은 helper를 쓰지만 `#tab-report`, `homeMode=false`를 직접 전달하므로 기존 리포트 흐름과 분리된다.
- CSS로 리포트 마크업을 숨기는 방식이 아니라 잘못된 마크업이 홈에 렌더링되는 원인을 줄였다.
- 월 MAX 게이지는 오래된 `width:100%` 회귀를 뒤쪽 CSS에서 `width:auto`로 덮어 좌우 margin이 카드 폭에 더해지지 않게 했다.
- 게이지 내부 body/track에 `min-width:0`, `max-width:100%`를 부여해 긴 금액 표시가 행 폭 계산을 밀지 않게 했다.

## 검증 확인

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 산출물에서 새 cache bust, 렌더 컨텍스트 전달 로직, 게이지 row 폭 보정 CSS 확인.

## 남은 리스크

- not verified yet: 운영 GitHub Pages 배포와 실제 로그인 세션에서 홈 `이번 달`/`이번 2주`, `월 MAX 게이지` 표시 검증이 아직 남아 있다.
