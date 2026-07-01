# 거래 달력 CSS 복구 실행 기록

## 범위

- 진단 문서: `docs/ai/diagnoses/2026-06-30-tx-calendar-css-regression.md`
- 실행 슬라이스: 거래 달력 CSS 복구
- 실행일: 2026-07-01 KST

## 변경 요약

- `styles/70-reports.css`에 거래 탭에서 쓰는 `#tab-tx .hero`, `.tx-month-title`, `.tx-calendar-*`, `.calendar-grid`, `.cal-dow`, `.cal-day` 기본 스타일을 복구했다.
- 선택 탭 전용 CSS 파일이나 `#tab-cart` 스타일은 되살리지 않았다.
- `style.css`의 `styles/70-reports.css` import query와 `index.html`의 `style.css` query를 `20260701-calendar-css-fix-2`로 갱신했다.
- repo root에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 없어 서비스워커 캐시 버전 갱신 대상은 없었다.

## 검증

- 실행: `npm.cmd run verify`
- 결과: 통과 (`verify-project passed (94 JS files checked).`)
- 실제 브라우저 UI 확인은 아직 not verified yet. 프로젝트 규칙상 정상 터미널에서 dev server를 띄운 뒤 `http://localhost:5501/` 거래 탭 달력 첫 화면을 확인해야 한다.

## 리뷰 포인트

- 복구 범위가 거래 탭으로만 스코프되어 선택 탭 제거를 되돌리지 않는지 확인한다.
- 거래 요약 카드, 달력 카드, 요일 라벨과 날짜 버튼이 카드형/7열 grid로 돌아오고 기본 브라우저 버튼 테두리가 사라지는지 확인한다.
