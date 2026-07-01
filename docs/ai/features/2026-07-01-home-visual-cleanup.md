# 홈 상단 시각 정리 계획

## 요청

- 홈 화면의 폰트가 원래 디자인과 맞지 않아 보이는 부분을 수정한다.
- 홈 지출 카드의 `이번 2주` / `이번 달` 토글과 설정 버튼 디자인을 정리한다.
- 최상단 최좌측에 노출되는 가짜 기기 상태 표시(`9:41`, `5G`, 막대 아이콘)를 삭제한다.

## 그릴 결과

- 핵심 질문: 홈 상단을 새 디자인으로 크게 바꿀지, 현재 카드 구조를 유지하면서 깨진 시각 요소만 정리할지?
- 코드/스크린샷 확인 결과: 요청은 홈 첫 화면의 기존 구조 유지와 시각 회귀 수정에 가깝다.
- 결정: 레이아웃과 계산 로직은 유지하고, 가짜 status bar 제거, 홈 hero 토글/설정 버튼 스타일, 폰트/자간만 좁게 정리한다.
- 남은 가정: `이번 2주` / `이번 달` 전환 동작과 2주 시작일 설정 모달은 그대로 유지한다.

## 코드 확인

- `index.html`의 `#app` 안에 `.status-bar`가 직접 렌더링되고 있어 스크린샷 상단의 가짜 `9:41`, `5G` 표시 원인이다.
- 홈 화면은 `render-home.js`가 `renderReport({ homeMode: true })`를 호출하고, 실제 hero 마크업은 `render-report.js`의 `reportModeControlHtml()`과 `.home-hero-card` 영역에서 생성된다.
- 홈 hero 전용 CSS는 주로 `styles/60-urge.css`에 있다.
- 현재 CSS import/cache-busting은 `style.css`와 `index.html`에서 query string으로 관리된다.
- 현재 repo에서 `sw.js`, `CACHE_VERSION`, `STATIC_ASSETS` 파일은 확인되지 않았다. 서비스 워커가 추가로 발견되면 해당 규칙을 따른다.

## 실행 슬라이스 1 - 홈 첫 화면 시각 회귀 정리

### 목표

- 최상단 가짜 status bar를 제거한다.
- 홈 hero의 `이번 2주` / `이번 달` 토글을 기존 앱 톤에 맞게 더 단정한 segmented control로 정리한다.
- 설정 버튼은 토글과 어울리는 크기/간격/색으로 맞춘다.
- 금액/라벨/메타 텍스트의 `letter-spacing`, font weight, line-height를 기본 디자인 토큰과 어긋나지 않게 조정한다.

### 예상 변경 파일

- `index.html`
- `styles/60-urge.css`
- `style.css`
- 필요 시 `render-report.js`

### 범위 제외

- 예산 계산, 월/격주 범위 계산, Firestore 읽기/쓰기 변경
- 2주 시작일 설정 모달 저장 로직 변경
- 홈 관리 카테고리/변동비 목록 구성 변경
- 거래/목표/검토 탭 디자인 변경

### 구현 메모

- `index.html`에서 `.status-bar` 마크업을 삭제한다.
- `styles/60-urge.css`에서 `.home-hero-card .report-mode-tabs`, `.home-cycle-mode-row`, `.home-cycle-settings-btn`, `.home-hero-card .amount` 주변 규칙을 조정한다.
- 폰트 계열은 `var(--font-sans)` 흐름을 유지하고, 좁은 자간이나 과도한 weight가 어색한 곳은 0 자간과 기존 TDS 톤으로 되돌린다.
- CSS가 바뀌면 `style.css`의 import query와 `index.html`의 stylesheet query를 함께 갱신한다.

## 검증 계획

- `npm.cmd run verify`
- 정상 터미널에서 `npm.cmd run dev`
- `http://localhost:5501/` 접속 후 홈 첫 화면 확인
- 증명 기준:
  - 화면 최상단에 가짜 `9:41`, `5G`, 막대 아이콘이 보이지 않는다.
  - 홈 hero 안에서 `이번 2주` / `이번 달` 토글의 선택/비선택 상태가 명확하고 카드 디자인과 어울린다.
  - 설정 버튼이 토글과 같은 줄에서 튀지 않고, 누르면 기존 2주 시작일 모달이 열린다.
  - `이번 달` 전환 시 월간 hero와 `이번 달 변동비` 섹션이 기존처럼 렌더링된다.
  - 모바일 폭에서 금액/라벨/토글 텍스트가 겹치거나 잘리지 않는다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-01-home-visual-cleanup.md`의 실행 슬라이스 1을 구현한다. 홈 첫 화면의 가짜 status bar를 제거하고, 홈 hero의 `이번 2주`/`이번 달` 토글 및 폰트 스타일을 정리한 뒤 cache-busting과 검증을 수행한다.

## 실행 결과

- 상태: 슬라이스 1 구현 완료
- 실행 기록: `docs/ai/executions/2026-07-01-home-visual-cleanup.md`
- 리뷰 기록: `docs/ai/reviews/2026-07-01-home-visual-cleanup-review.md`
- 변경 파일:
  - `index.html`
  - `style.css`
  - `styles/60-urge.css`
  - `docs/ai/features/2026-07-01-home-visual-cleanup.md`
  - `docs/ai/executions/2026-07-01-home-visual-cleanup.md`
  - `docs/ai/NEXT_ACTION.md`
- 검증:
  - `npm.cmd run verify` 통과
  - 실제 브라우저 UI 확인은 not verified yet. 정상 터미널에서 `npm.cmd run dev` 후 `http://localhost:5501/` 홈 첫 화면을 확인해야 한다.
- 리뷰 결과:
  - 배포 전 차단 이슈 없음
