# 홈 상단 시각 정리 리뷰

## 결론

배포 전 차단 이슈 없음.

## 검토 범위

- 계획: `docs/ai/features/2026-07-01-home-visual-cleanup.md`
- 실행: `docs/ai/executions/2026-07-01-home-visual-cleanup.md`
- 변경 파일:
  - `index.html`
  - `style.css`
  - `styles/60-urge.css`
  - `docs/ai/features/2026-07-01-home-visual-cleanup.md`
  - `docs/ai/executions/2026-07-01-home-visual-cleanup.md`
  - `docs/ai/NEXT_ACTION.md`

## 확인 결과

- `index.html`의 `.status-bar` 마크업이 제거되어 가짜 `9:41`, `5G`, 막대 아이콘이 더 이상 앱 DOM에 렌더링되지 않는다.
- `styles/60-urge.css`의 홈 hero 토글 버튼에 `border: 0`, `appearance: none`, `background: transparent`, `font-family: var(--font-sans)`, `letter-spacing: 0`이 지정되어 브라우저 기본 버튼 테두리/폰트가 새어 나올 가능성을 줄였다.
- 설정 버튼은 기존 `data-report-action="open-biweekly-start-settings"` 마크업과 이벤트 경로를 유지하므로 2주 시작일 설정 모달 동작 변경이 없다.
- `index.html`의 `style.css` query와 `style.css`의 `styles/60-urge.css` import query가 함께 갱신됐다.
- repo 검색 결과 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 없어 서비스워커 캐시 버전 갱신 대상은 없다.
- `git diff --check`에서 공백 오류가 없다.

## 검증

- `npm.cmd run verify` 통과
- 실제 브라우저 UI 확인은 not verified yet. 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/` 홈 첫 화면과 설정 모달 클릭을 확인해야 한다.

## 남은 리스크

- 현재 Codex 세션에서는 장기 dev server를 검증 완료 근거로 삼지 않는 프로젝트 규칙 때문에, 실제 모바일 viewport에서 토글/설정 버튼의 시각 상태는 사용자의 정상 터미널 확인이 필요하다.
