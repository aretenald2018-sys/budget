# AI Roadmap

This file tracks AI-planned work. Each substantial request should become a plan file under
`docs/ai/features/` before app code changes begin.

## Active Plans

- None yet.

## 근본원인 묶음 백로그 (2026-07-24 프로세스 검토에서 도출)

`WORKFLOW.md`의 "버그 안정화 우선" 규칙에 따라, 개별 증상이 아니라 근본 원인 단위로 묶은 백로그다.
각 묶음은 착수 전 `docs/ai/features/YYYY-MM-DD-short-slug.md` 계획 문서를 만들고 **한 실행 세션 = 한 슬라이스**
규칙으로 진행한다. 이번 프로세스 검토 슬라이스에서는 이 항목들을 **수정하지 않고 백로그로만 남긴다.**

### 묶음 A — 데이터 정확성

- `features/home/dashboard.js`의 `DEFAULT_MODEL`(하드코딩 샘플 금액·카테고리·추세 배열, line 33–90)과
  폴백 스파크라인 배열(`buildTrend`의 `[8, 11, ...]`, `heroChartHtml`의 `[40, 38, ...]`)을 운영 렌더
  경로에서 제거한다.
- 데이터가 없거나 짧을 때의 표현은 `docs/ai/contracts/home.contract.md` §4 Q1·Q2 답변에 따라 빈 상태로
  처리한다.
- `buildTrend`/`buildCategories`/`buildGoals` 계산에 대한 단위 테스트를 동반한다.

### 묶음 B — 상태/상호작용

- 2주↔달 토글 미연결 문제는 `0c3fdb1`("홈탭 상호작용 감사: 2주↔달 토글 시 라벨·추세선·타이틀 갱신 +
  비활성 버튼 연결")로 **수정 완료**.
- 잔여: 세그먼트(기간/렌즈) 전환 시 스크롤 위치·입력값 보존을 E2E로 고정한다(회귀 방지). Playwright 슬라이스에서 진행.

### 묶음 C — 공통 구조

- `.bottom-nav`가 4개 CSS 파일에 중복 정의되어 있다: `styles/60-shell.css`, `styles/00-foundation.css`,
  `styles/features/finance.css`, `styles/features/home-dashboard.css`. 단일 정의로 통합한다.
- 홈 전용 내비 변형(`body[data-tab="home"]`에서 finance 항목 `display:none`·색상 변경)은
  `home.contract.md` §4 Q6 답변 후 이 슬라이스에서 함께 정리한다.

### 묶음 A-보강 — lint 도입 시 발견된 실버그 의심 (2026-07-24, 미수정)

ESLint 첫 도입 실행에서 발견됐으나 범위 외라 수정하지 않은 항목. 각각 `/diagnose`로 재현 후 수정한다.

- `render-finance.js:355` — `pickTrackForPosition`이 `features/finance/assets/service.js`에서 import되지
  않은 채 호출됨. 자산 임포트 리뷰 렌더 시 `ReferenceError` 가능성 (no-undef, 해당 파일만 warn으로 완화해 둠).
- `api/asset-image-parse.js:119` — 반환 객체에 `quantity` 키 중복. 뒤의 `quantity: 1`이 파싱된 수량을
  덮어써 항상 1이 됨 (no-dupe-keys).
- `api/_lib/recipe-preview.js:355` — `u` 플래그 없는 문자 클래스에 이모지(서러게이트 페어) 포함, 의도대로
  매치되지 않을 수 있음 (no-misleading-character-class).

### 묶음 D — 반응형

- 320 / 360 / 390 / 412px 시각 회귀 베이스라인 구축 **완료** (2026-07-24, `e2e/visual.spec.mjs` 스냅샷 16장).
- 베이스라인에서 잘림·겹침이 발견되면 개별 이슈로 분리해 각각 슬라이스화한다.
- **발견됨 (2026-07-24, E2E 구축 중)**: 홈 히어로의 '분석 보기' 버튼(`.hd-analyze`)이 320/360px에서
  렌즈/기간 세그먼트 위로 겹쳐 pointer 이벤트를 가로챈다. 스모크 테스트는 `dispatchEvent('click')`로
  우회 중이며, 현재 시각 베이스라인에는 겹친 상태가 그대로 기록되어 있다. 수정 슬라이스에서 레이아웃을
  고친 뒤 베이스라인을 갱신하고 스모크의 우회 클릭도 실제 클릭으로 되돌린다.

## Completed Reviews

- None yet.

