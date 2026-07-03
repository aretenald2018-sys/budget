# 교통비용 literal 미지정 상세분류 클릭 실행

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-transport-subcategory-literal-unassigned.md`
- 요청: `devreq_discord_1510804891134595225`
- 실행 슬라이스: 미지정 상세분류 판정 통일

## 변경 내용

- `render-report.js`
  - `isUnassignedSubcategory()` helper를 추가했다.
  - 상세분류 요약과 분류 시트 대상 필터가 빈 값과 literal `상세분류 미지정`을 모두 미지정으로 취급하게 했다.
- `index.html`, `app.js`, `render-home.js`
  - 새 `render-report.js`가 로드되도록 cache-bust 문자열을 `20260703-transport-unassigned`로 갱신했다.

## 검증

- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `node --check render-home.js`: 통과
- `git diff --check`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site/index.html`, `_site/app.js`, `_site/render-home.js`, `_site/render-report.js` 정적 확인: 새 cache-bust와 `isUnassignedSubcategory()` 포함 확인

## 배포

not verified yet: production 배포는 수행하지 못했다. 작업 시작 전부터 unrelated dirty changes가 대량으로 있었고, 이번 요청 파일인 `render-report.js`, `app.js`, `render-home.js`, `index.html`에도 기존 미커밋 변경이 섞여 있어 전체 커밋/푸시를 안전하게 진행할 수 없다.
