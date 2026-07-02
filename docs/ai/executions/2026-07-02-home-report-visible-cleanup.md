# 홈/거래 상단 UI 정리 및 보조 금액 폰트 수정 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-home-report-visible-cleanup.md`
- 슬라이스: 실행 슬라이스 1 - 보이는 회귀만 정리

## 변경 내용

- `render-report.js`
  - 홈 모드에서 상단 `.report-month-nav` 기간 이동 카드를 렌더링하지 않게 했다.
  - 홈 모드에서 `관리 카테고리` 섹션을 렌더링하지 않게 했다.
  - `home-cycle-nav`, `homeManagedCategoryCards` 등 제거된 UI 전용 helper를 정리했다.
  - hero 보조 지표 마크업을 label/value 구조로 분리했다.
- `render-tx.js`
  - 검토 대상이 없을 때 `자동 분류 정상` 배지를 렌더링하지 않게 했다.
- `styles/60-urge.css`
  - hero 보조 지표의 라벨과 금액 폰트/줄바꿈을 고정했다.
  - 더 이상 쓰지 않는 `home-cycle-nav` CSS를 제거했다.
- `style.css`, `render-home.js`, `app.js`, `index.html`
  - 변경된 CSS/JS가 다시 로드되도록 `20260702-home-visible-cleanup` cache-busting query를 적용했다.

## 검증

- `node --check render-report.js`
- `node --check render-tx.js`
- `node --check render-home.js`
- `node --check app.js`
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과 (`_site` 생성)
- `_site` 확인:
  - 새 cache-bust `20260702-home-visible-cleanup` 반영
  - `자동 분류 정상`, `관리 카테고리`, `home-managed-section`, `home-cycle-nav` 제거 대상 문자열 없음
- `git diff --check -- ...`: 통과

## 미검증

- 운영 GitHub Pages 배포 완료: commit `64232a8`, run `28569569242` 성공.
- production HTTP 확인 완료: `/budget/`, `app.js`, `render-report.js`, `render-tx.js`, `styles/60-urge.css` 모두 `200`; 새 cache-bust 반영; 제거 대상 문자열 없음.
- not verified yet: 로그인된 사용자 세션에서 실제 홈/거래 탭을 눈으로 확인하는 단계는 이 환경에서 수행하지 못했다.

## 변경 파일

- `render-report.js`
- `render-tx.js`
- `styles/60-urge.css`
- `style.css`
- `render-home.js`
- `app.js`
- `index.html`
- `docs/ai/diagnoses/2026-07-02-home-report-visible-cleanup.md`
- `docs/ai/features/2026-07-02-home-report-visible-cleanup.md`
- `docs/ai/executions/2026-07-02-home-report-visible-cleanup.md`
