# 홈 관리 카테고리 변동비 목록 노출 리뷰

## 리뷰 대상

- 계획 문서: `docs/ai/features/2026-06-02-home-managed-variable-visibility.md`
- 변경 파일:
  - `render-report.js`
  - `render-home.js`
  - `app.js`
  - `index.html`
  - `docs/ai/NEXT_ACTION.md`
  - `docs/ai/features/2026-06-02-home-managed-variable-visibility.md`

## 결과

- 발견 이슈: 없음

## 확인 내용

- `render-report.js`의 홈 모드에서 `관리 카테고리` 섹션은 선택된 `homeManagedCategoryIds`만 사용하고, `이번 2주 변동비`/`이번 달 변동비` 섹션은 `controlCategories` 전체를 사용한다.
- `targetFor()`, `usedFor()`, `budgetGaugeGroups()`의 계산식은 변경하지 않아 예산 합산 방식과 월/격주 모드 계산 범위가 유지된다.
- 정적 호스팅 캐시 반영을 위해 `index.html` -> `app.js` -> `render-home.js`/`render-report.js` query string이 `20260602-managed-variable`로 연결된다.

## 검증

- `node --check app.js; node --check render-home.js; node --check render-report.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 아티팩트에서 새 query string 및 `homeVariableCategories` 반영 확인
- 실제 로그인된 운영 데이터에서 홈 화면의 중복 노출 UI 확인은 배포 후 확인 필요

## 배포

- 상태: 배포 전
- 다음 확인: `Deploy GitHub Pages` 워크플로 성공 후 `https://aretenald2018-sys.github.io/budget/` 및 배포본 JS HTTP 200 확인
