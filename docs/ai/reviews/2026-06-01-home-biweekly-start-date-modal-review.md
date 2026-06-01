# 홈 2주 시작일 설정 모달 전환 리뷰

## 범위

- 계획: `docs/ai/features/2026-06-01-home-biweekly-start-date-modal.md`
- Discord 요청: `devreq_discord_1510798058965831811`
- 슬라이스: 홈 2주 시작일 설정 모달 전환

## 리뷰 대상

- `render-report.js`
- `styles/60-urge.css`
- `style.css`
- `index.html`
- `app.js`
- `render-home.js`
- `docs/ai/features/2026-06-01-home-biweekly-start-date-modal.md`
- `docs/ai/NEXT_ACTION.md`

## 결과

- 차단 이슈: 없음
- 비차단 검증 갭: 실제 로그인 UI에서 홈 설정 버튼 클릭, 모달 표시, 시작일 저장, hero/header 범위 갱신은 not verified yet. 프로젝트 규칙상 sandbox에서 장기 dev server를 실행해 검증 완료로 주장하지 않는다.

## 확인 내용

- 홈 모드에서만 `home-cycle-mode-row`가 렌더링되어 리포트 탭의 기존 `report-mode-tabs` 구조는 유지된다.
- 설정 버튼은 `type="button"`과 `data-report-action` 기반 delegated listener로 연결되어 inline quoted handler를 추가하지 않았다.
- 시작일 모달은 `#modals-container`에 생성되므로 CSS를 `#tab-home`에 묶지 않고 전역 modal class로 지정했다.
- 저장 로직은 기존 `saveBiweeklyStartDate()`를 재사용하고, 성공 시 `saveAppSettings`, `localStorage`, `refreshAppHeader()`, 현재 화면 재렌더를 유지한다.
- `style.css`, `index.html`, `app.js`, `render-home.js` cache-busting query string이 갱신됐다.
- `sw.js` / `STATIC_ASSETS`는 이 저장소에 존재하지 않아 service worker cache version bump 대상이 없었다.

## 검증

- `node --check render-report.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 95 JS files checked)
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- `git diff --check`: 통과
