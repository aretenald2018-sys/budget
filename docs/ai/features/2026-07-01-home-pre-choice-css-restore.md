# 홈 탭 삭제 이전 CSS 복구 계획

## 요청

- 홈 최상단 카드가 이상하다.
- `이번 달 고정비` 안 폰트가 이상하다.
- 최근 탭 삭제하기 이전 디자인으로 바꾼다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-01-home-css-regression-after-choice-removal.md`
- 기준 커밋은 `4d0e02f Remove choice tab`의 직전 커밋인 `e9e370f`이다.
- `.report-month-nav` flex 레이아웃과 `.fixed-cost-row` grid/폰트 규칙이 탭 삭제 과정에서 빠진 것이 핵심 원인이다.

## 그릴 결과

- 핵심 질문: 삭제 전 CSS 전체를 되돌릴지, 홈 화면에서 깨진 카드와 고정비 영역만 복구할지?
- 결정: 전체 CSS rollback은 하지 않고 홈의 `report-month-nav`, hero 토글, fixed-cost 영역만 `e9e370f` 기준으로 복구한다.
- 이유: 전체 rollback은 이미 삭제한 선택 탭/장바구니 CSS와 충돌할 수 있고, 요청 증상은 홈 화면 일부 선택자에 한정된다.
- 남은 가정: 가짜 status bar 제거는 유지한다. 사용자가 말한 "최상단 카드"는 홈의 흰색 기간/이동 카드인 `.report-month-nav.home-cycle-nav`로 본다.

## 실행 슬라이스 1 - 홈 기간 카드와 고정비 CSS 복구

### 목표

- `.report-month-nav`와 `.report-month-nav.home-cycle-nav`를 삭제 전처럼 한 줄 flex 카드로 되돌린다.
- 홈 hero 토글/설정 버튼은 직전 탭 삭제 전 `styles/60-urge.css` 값으로 되돌린다.
- `.fixed-cost-summary`, `.fixed-cost-row`, `.fixed-cost-row span/strong/em` 규칙을 삭제 전 `styles/30-cart-board.css` 기준으로 복구한다.

### 예상 변경 파일

- `styles/60-urge.css`
- `style.css`
- `index.html`
- `docs/ai/features/2026-07-01-home-pre-choice-css-restore.md`
- `docs/ai/NEXT_ACTION.md`

### 범위 제외

- 앱 로직, Firestore 읽기/쓰기, 예산 계산 변경
- 삭제된 선택 탭/장바구니 탭 CSS 전체 복구
- `index.html`의 가짜 status bar 재추가
- 거래/목표/검토 탭 디자인 변경

### 구현 메모

- `styles/60-urge.css`의 `.report-month-nav`에 `display:flex`, `align-items:center`, `justify-content:space-between`을 복구한다.
- `.report-month-nav.home-cycle-nav`는 `e9e370f:styles/40-cart-choice.css`의 홈 전용 값을 우선한다.
- 홈 hero 토글은 `e9e370f:styles/60-urge.css`의 gap/margin/padding/font-size/weight/box-shadow 값을 복구한다.
- 고정비는 `e9e370f:styles/30-cart-board.css`의 `.fixed-cost-summary`와 `.fixed-cost-row` 블록을 현재 `styles/60-urge.css`에 필요한 범위로 복구한다.
- CSS 변경 후 `style.css`와 `index.html` cache-busting query를 갱신한다.
- repo에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 발견되면 함께 갱신한다. 현재 검색 결과는 없음.

## 검증 계획

- `npm.cmd run verify`
- 정상 터미널에서 `npm.cmd run dev`
- `http://localhost:5501/` 홈 확인
- 증명 기준:
  - 홈 최상단 기간 카드의 이전/다음 버튼과 `1일째 · 남은 13일` 텍스트가 한 줄 flex 레이아웃으로 정렬된다.
  - 홈 지출 hero 토글이 탭 삭제 전처럼 작고 단정한 pill 형태로 보인다.
  - `이번 달 고정비` 카드에서 요약과 각 고정비 행이 삭제 전처럼 작은 폰트/grid 행으로 정렬된다.
  - 가짜 status bar는 다시 생기지 않는다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-01-home-pre-choice-css-restore.md`의 실행 슬라이스 1을 구현한다. `e9e370f` 기준으로 홈 기간 카드, hero 토글, 고정비 CSS만 복구하고 cache-busting 및 검증을 수행한다.
