# 로딩/성능 안정화 리뷰

## 리뷰 범위

- 계획: `docs/ai/features/2026-06-01-loading-performance-stabilization.md`
- 변경 파일:
  - `app.js`
  - `data.js`
  - `render-cart.js`
  - `render-tx.js`
  - `render-home.js`
  - `index.html`
  - `docs/ai/NEXT_ACTION.md`

## Findings

- 차단 이슈 없음.

## 확인 내용

- `app.js`
  - 탭 렌더는 8초 지연 안내와 별개로 25초 hard timeout을 갖고, timeout/error 후 retry UI를 표시한다.
  - 렌더 중 같은 탭 클릭과 프로그램 refresh가 중복 렌더를 만들지 않으며, 정상 완료 시 pending refresh만 한 번 재실행한다.
  - modal preload를 백그라운드화하면서 빠른 클릭 fallback을 설치해 `openTxEditModal`, `openTxAddModal`, `openCategoryModal`, `openAccountModal`이 미등록 상태로 터지지 않게 했다.
- `render-cart.js`
  - 선택 탭 shell이 카테고리 조회보다 먼저 표시되고, 카테고리 조회는 item/pact/mindbank/urge 로드와 병렬화됐다.
- `render-tx.js`
  - 월간 캘린더 요약이 첫 거래 목록 batch를 막지 않고, 요약 실패 시 거래 목록은 계속 사용할 수 있다.
- `data.js`
  - `getAppSettings()`와 금융 migration/preset ensure가 in-flight promise를 공유해 같은 화면 진입에서 중복 Firestore read/write를 줄인다.
- cache/service worker
  - `index.html`, `app.js`, `render-home.js`의 JS cache-bust 문자열이 `20260601-loading-perf`로 갱신됐다.
  - repo root에 `sw.js`/`STATIC_ASSETS`가 없어 `CACHE_VERSION` 갱신 대상은 없다.

## 검증

- `node --check app.js`: 통과
- `node --check data.js`: 통과
- `node --check render-cart.js`: 통과
- `node --check render-tx.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `git diff --check`: 통과
- `_site` artifact에서 `20260601-loading-perf`, `TAB_RENDER_TIMEOUT_MS`, `renderCalendarSummarySafe`, `_financeMigrationPromise` 반영 확인

## 검증 공백

- 실제 로그인된 앱에서 Firestore 지연 상황의 탭 전환 체감과 25초 timeout UI는 not verified yet이다. 프로젝트 지침상 sandbox에서 장기 dev server를 완료 검증으로 주장하지 않는다.
