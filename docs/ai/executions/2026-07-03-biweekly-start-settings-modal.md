# 2주 시작일 설정 버튼 축소 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-biweekly-start-settings-modal.md`
- 실행 슬라이스: Slice 1 `현 구현 고정 및 검증`
- Discord 요청: `devreq_discord_1510798058965831811`

## 변경 내용

- `render-report.js`
  - `reportModeControlHtml()`이 홈 화면뿐 아니라 월간 리포트 탭에서도 토글 옆 설정 버튼을 렌더링하도록 변경했다.
  - 설정 버튼은 기존 `open-biweekly-start-settings` 액션과 기존 `home-cycle-settings-modal` 저장 흐름을 그대로 사용한다.
- `styles/60-urge.css`
  - 토글 스타일을 `.home-hero-card` 전용에서 `.report-hero-card` 공통으로 확장했다.
  - 새 `.report-cycle-mode-row`가 토글과 설정 버튼을 같은 행에 배치한다.
- `styles/50-cart-detail.css`
  - 데스크톱 홈 레이아웃에서 새 토글 행이 기존 토글과 같은 grid column에 놓이도록 보정했다.
- `style.css`, `app.js`, `render-home.js`, `index.html`
  - 수정된 CSS/JS가 브라우저에서 다시 로드되도록 cache-busting query string을 갱신했다.
  - `index.html`의 `app.js` 기본 `v=20260703-ingest-purge`는 프로젝트 검증 규칙에 맞춰 유지하고, 이번 변경은 `cb=20260703-biweekly-settings-modal`로 붙였다.

## 검증

- `npm.cmd run verify`
  - 1차 실패: `index.html must cache-bust app.js with 20260703-ingest-purge`
  - 조치: `app.js`의 canonical `v`는 유지하고 `cb`만 이번 변경명으로 수정
  - 재실행 결과: 통과, `verify-project passed (82 JS files checked).`
- `npm.cmd run pages:build`
  - 통과, `_site` 산출물 생성 확인
- 산출물 정적 확인
  - `_site/render-report.js`에 `report-cycle-mode-row`, `home-cycle-settings-btn`, `home-cycle-settings-modal` 포함 확인
  - `_site/index.html`, `_site/app.js`, `_site/style.css`의 cache-busting 반영 확인

## 미완료 검증

- not verified yet: production 배포와 운영 UI 클릭 검증은 완료하지 못했다.
- 차단 사유: 이 요청과 무관한 dirty worktree가 대량으로 있어, 의도하지 않은 변경을 포함하지 않고 `main`에 커밋/푸시하는 배포를 안전하게 수행할 수 없다.

## 배포 상태

- 배포하지 못했습니다: unrelated dirty worktree.
- 다음 명령은 dirty worktree가 정리된 뒤 실행 대상이다.
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 의도한 변경만 커밋 후 `git push origin main`
