# 거래 달력 CSS 복구 리뷰

## 결론

배포 전 차단 이슈 없음.

## 검토 범위

- 진단: `docs/ai/diagnoses/2026-06-30-tx-calendar-css-regression.md`
- 실행 기록: `docs/ai/executions/2026-07-01-tx-calendar-css-recovery.md`
- 주요 변경: 거래 탭 달력 grid/day 기본 CSS 복구, CSS cache-bust query 갱신
- 추가 수정: 거래 요약 카드와 달력 카드 헤더도 삭제된 선택 탭 CSS 안에 섞여 있어 `#tab-tx` 스코프로 복구

## 확인 결과

- `styles/70-reports.css`의 복구 스타일은 `#tab-tx`로 스코프되어 선택 탭 `#tab-cart`나 삭제된 선택 전용 CSS를 되살리지 않는다.
- `#tab-tx .hero`가 거래 요약을 다시 카드형 요약으로 표시하고, `.tx-month-title`/`.tx-calendar-card`/`.tx-calendar-head`가 기본 HTML 버튼/텍스트처럼 풀리는 문제를 막는다.
- `#tab-tx .calendar-grid`가 7열 grid를 다시 제공하고, `#tab-tx .cal-day`가 기본 버튼 테두리/배경을 제거한다.
- 기존 `#tab-tx .tx-calendar-grid .cal-day em/small` 줄임 스타일과 충돌하지 않도록 기본 스타일 뒤에 거래 달력 보강 스타일이 유지된다.
- `style.css`와 `index.html`의 CSS cache-bust query가 `20260701-calendar-css-fix-2`로 갱신됐다.
- repo root에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 없어 서비스워커 캐시 버전 갱신 대상은 없다.

## 검증

- `npm.cmd run verify` 통과.
- 실제 브라우저 UI 확인은 not verified yet. 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/` 거래 탭 달력 첫 화면을 확인해야 한다.

## 남은 리스크

- 현재 Codex 세션에서는 장기 dev server를 검증 완료 근거로 삼지 않는 프로젝트 규칙 때문에, 실제 화면에서 요일/날짜가 7열로 표시되는지는 사용자의 정상 터미널 확인이 필요하다.
