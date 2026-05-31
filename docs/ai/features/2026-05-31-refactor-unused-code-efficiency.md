# 리팩토링: 미사용 코드 정리와 효율화

## 상태

- 세션: planning + execution + review 완료
- 작성일: 2026-05-31
- 사용자 요청: "리팩토링 해줘. 더 이상 사용되지 않는 코드들 지우고, 효율화할 수 있는 것들은 효율화하고."
- 앱 코드 변경 상태: 슬라이스 1, 2, 3 완료
- 완료 리뷰: `docs/ai/reviews/2026-05-31-refactor-unused-code-efficiency-slice1-review.md`, `docs/ai/reviews/2026-05-31-refactor-unused-code-efficiency-slice2-review.md`, `docs/ai/reviews/2026-05-31-refactor-unused-code-efficiency-slice3-review.md`
- 최종 검증: `node --check`, CSS brace balance, `npm.cmd run verify` 통과. 실제 브라우저 UI 조작 검증은 일반 터미널 dev server에서 별도 확인 필요.

## 그릴 결과

- 핵심 질문: 리팩토링 범위를 어느 정도까지 넓힐 것인가?
- 추천 답변: 안전 우선으로, 정적 증거가 있는 미사용 코드 제거부터 시작하고 동작 변경 가능성이 있는 구조 개선은 별도 slice로 나눈다.
- 결정: 첫 slice는 참조가 끊긴 비활성 파일과 배포 복사 목록만 정리한다. UI/CSS 구조 정리는 별도 slice에서 실제 화면 검증과 함께 진행한다.
- 남은 가정: 사용자는 기능 동작 유지와 회귀 위험 최소화를 원한다. raw message, ingest pipeline, root `api/` 경로, Firebase 데이터 구조는 삭제/변경하지 않는다.

## 조사 요약

- `docs/ai/NEXT_ACTION.md`는 이전 네이버페이 작업이 `complete`라서 이번 요청이 새 계획이다.
- `match.js`와 `parse.js`는 주석만 남은 비활성 파일이고, 현재 검색 기준으로 앱/API/script에서 실제 import되지 않는다.
- `scripts/build-pages.mjs`는 여전히 `match.js`, `parse.js`를 Pages artifact에 복사하고 있다.
- `modals/account-modal.js`, `modals/category-modal.js`, `modals/tx-edit-modal.js`는 정적 import 그래프에서는 미참조처럼 보이지만 `modal-manager.js`의 `MODALS` 배열로 동적 import되므로 삭제 대상이 아니다.
- `sw.js`는 현재 존재하지 않는다. 따라서 이번 계획에서 서비스워커 `CACHE_VERSION` bump 대상은 없다.
- root `api/`는 `docs/ai/features/2026-05-14-vercel-api-bridge.md`와 현재 아키텍처 규칙상 삭제 금지다.
- `render-cart.js`는 3800라인으로 `scripts/verify-project.mjs`의 한계값에 닿아 있다. `buySegmentHtml()`는 현재 검색 기준 호출부가 없어 다음 UI cleanup 후보가 된다.
- `.cart-decision-hero` CSS는 여러 CSS 모듈에 남아 있지만 현재 `render-cart.js`에서 같은 class를 생성하지 않는다. 단, CSS 삭제는 선택 탭 화면 검증과 함께 별도 slice에서 한다.
- 작업트리에는 기존 untracked 산출물/문서(`budget-calendar-2026-05.csv`, `docs/ai/DISCORD_CODEX_INDEX.md`, `docs/ai/audit/`, `docs/ai/inbox/`, `docs/ai/outbox/`, `scripts/export-calendar-csv.mjs`)가 있다. 이번 리팩토링에서는 사용자 변경으로 보고 건드리지 않는다.

## 슬라이스 1: 비활성 root 파일과 Pages 복사 목록 정리

### 목표

- 실제 import되지 않고 주석만 남은 `match.js`, `parse.js`를 제거한다.
- `scripts/build-pages.mjs`의 `rootFiles`에서 두 파일을 제거해 Pages artifact 복사 표면을 줄인다.

### 변경 예상 파일

- `match.js`
- `parse.js`
- `scripts/build-pages.mjs`
- 필요 시 `docs/ai/NEXT_ACTION.md`

### 하지 않을 것

- `modals/` 삭제
- root `api/` 또는 GitHub Actions ingest pipeline 변경
- 브라우저 fallback parsing 동작 변경
- UI/CSS 정리
- raw message 또는 Firestore 데이터 변경

### 검증

- `node --check scripts/build-pages.mjs`
- `npm.cmd run verify`
- 사용자가 일반 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/` 접속
- 증명 상태: `/`가 HTTP 200이고 앱 첫 화면이 렌더링되며, Pages artifact 생성 중 `match.js`/`parse.js` 누락 오류가 없어야 한다.

## 슬라이스 2: 선택 탭 미사용 렌더/CSS 정리

### 목표

- `buySegmentHtml()`의 호출부가 없음을 다시 확인한 뒤 제거한다.
- `.cart-decision-hero` 관련 CSS 블록이 현재 DOM에서 쓰이지 않음을 확인한 뒤 제거한다.
- CSS/JS 변경에 맞춰 `index.html`, `app.js`, `style.css`의 cache-busting query string을 필요한 만큼 갱신한다.

### 변경 예상 파일

- `render-cart.js`
- `styles/20-records.css`
- `styles/30-cart-board.css`
- `styles/40-cart-choice.css`
- `styles/50-cart-detail.css`
- `styles/80-responsive.css`
- `style.css`
- `app.js`
- `index.html`

### 하지 않을 것

- 선택 탭 디자인 재설계
- 액션 시트/상세 모달 동작 변경
- 데이터 저장 schema 변경

### 검증

- `node --check render-cart.js`
- `npm.cmd run verify`
- 사용자가 일반 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/`
- 선택 탭에서 세그먼트 선택, 카드 액션 시트, 상세 모달 첫 화면, 조건 접기/펼치기, 저장 경로가 기존처럼 동작해야 한다.

## 슬라이스 3: 배포 복사/검증 규칙 보강

### 목표

- 리팩토링 후에도 죽은 root 파일이 Pages artifact에 다시 들어가지 않도록 `scripts/verify-project.mjs`에 작은 guard를 추가할지 검토한다.
- `scripts/build-pages.mjs`의 복사 목록이 실제 정적 앱 surface와 맞는지 정리한다.

### 변경 예상 파일

- `scripts/build-pages.mjs`
- `scripts/verify-project.mjs`

### 하지 않을 것

- 빌드 시스템 교체
- bundler 도입
- GitHub Actions workflow 구조 변경

### 검증

- `node --check scripts/build-pages.mjs`
- `node --check scripts/verify-project.mjs`
- `npm.cmd run verify`

## 완료 메모

- 비활성 root 파일 `match.js`, `parse.js`를 삭제했고 Pages 복사 목록에서도 제거했다.
- 선택 탭의 미사용 렌더 helper, 옛 레시피/주문처 시트 경로, 관련 CSS selector를 제거했다.
- CSS/JS cache-busting query string을 `20260531-refactor`로 갱신했다.
- `scripts/verify-project.mjs`에 retired artifact 재도입 방지 guard를 추가했다.
