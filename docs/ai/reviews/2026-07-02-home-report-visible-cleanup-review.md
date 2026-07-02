# 홈/거래 상단 UI 정리 및 보조 금액 폰트 수정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-home-report-visible-cleanup.md`
- 실행: `docs/ai/executions/2026-07-02-home-report-visible-cleanup.md`
- 주요 변경 파일:
  - `render-report.js`
  - `render-tx.js`
  - `styles/60-urge.css`
  - `style.css`
  - `render-home.js`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈: 없음
- 홈 모드 제거 대상은 CSS 숨김이 아니라 렌더링 자체에서 빠졌다.
- 리포트 탭 월 이동 카드와 월간 리포트 흐름은 유지된다.
- 거래 탭 검토 필요 버튼은 유지되고, 정상 상태 배지만 제거됐다.
- cache-busting 연결은 `index.html` → `app.js` → `render-home.js`/`render-report.js`/`render-tx.js`, `index.html` → `style.css` → `styles/60-urge.css`로 맞다.
- repo root에 `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 검증 확인

- `node --check render-report.js; node --check render-tx.js; node --check render-home.js; node --check app.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 문자열 확인: 제거 대상 문자열 없음, 새 cache-bust 반영
- `git diff --check -- ...`: 통과

## 남은 리스크

- not verified yet: 운영 GitHub Pages 배포와 실제 로그인 UI 조작은 수행하지 못했다.
- 차단 사유: 작업트리에 이 요청과 무관한 dirty 변경이 많아 안전한 커밋/푸시 범위를 확정할 수 없다.
