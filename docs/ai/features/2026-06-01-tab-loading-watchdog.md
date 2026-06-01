# 탭 무한 로딩 방지 계획

## 요청

- Discord 요청: `devreq_discord_1510813727467765821`
- 사용자 보고: 여러 화면을 누르면 `로딩중` 상태가 끝나지 않고, 앱 자체와 데이터 로딩이 무겁게 느껴진다.
- 추가 steering: "앱자체가 뭔가 굉장히 무거워짐. 데이터로딩 왜이리느림"

## `/diagnose`

### 재현/피드백 루프

- 정적 재현:
  - `render-finance.js`, `render-review.js`, `render-settle.js`, `render-report.js`, `render-cart.js`는 탭 진입 초기에 로딩 스피너를 렌더링한 뒤 Firestore 요청을 기다린다.
  - `app.js`의 `switchTab()`은 렌더러 예외를 토스트로만 알리고, 해당 탭의 스피너/로딩 화면은 실패 UI로 교체하지 않는다.
  - `render-tx.js`의 `_loadMore()`는 `listTransactions()` 실패 시 `STATE.loading`을 `false`로 복구하지 않아 이후 추가 로딩도 막힐 수 있다.
- 수정 후 확인:
  - 탭 렌더가 지연되면 스피너만 보이는 대신 재시도 가능한 "로딩 지연" 상태가 표시된다.
  - 탭 렌더가 실패하면 기존 스피너가 오류/재시도 UI로 교체된다.
  - 거래 내역 로딩 실패 뒤에도 `STATE.loading`이 복구된다.
  - `node --check`, `npm.cmd run verify`, `git diff --check`, Pages artifact build를 실행한다.
- 실제 UI 확인:
  - 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/`에서 주요 하단 탭을 눌러 지연/실패 시 스피너만 남지 않는지 확인한다.
  - 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 앱 shell HTTP 200과 새 cache-bust 문자열을 확인한다.

### 가설

1. 탭 렌더 실패가 토스트로만 처리되어 탭 본문에는 무한 스피너가 남는다.
2. 느린 Firestore 요청은 실패하지 않아도 스피너 외 피드백이 없어 사용자가 멈춘 화면으로 인식한다.
3. 거래 내역 무한스크롤은 실패 시 내부 `loading` 플래그가 풀리지 않아 재시도 동작이 막힐 수 있다.
4. `data.js`의 Firestore 쿼리 자체 최적화는 컬렉션/인덱스/데이터량을 봐야 하므로 이번 슬라이스에서는 "멈춘 것처럼 보이는 UI"와 명확한 재시도 경로를 먼저 고친다.

## 실행 슬라이스

### 슬라이스 1: 탭 렌더 지연/실패 복구 UI

- `app.js`
  - 탭 렌더를 공통 함수로 감싸고, 렌더 토큰을 두어 이전 탭의 늦은 실패가 현재 탭 UI를 덮지 않게 한다.
  - 일정 시간 이상 렌더가 끝나지 않으면 현재 탭의 로딩 스피너 영역을 재시도 가능한 지연 안내로 교체한다.
  - 렌더 실패 시 현재 탭 본문을 오류/재시도 UI로 교체한다.
  - `refreshCurrentTab()`도 같은 공통 렌더 경로를 사용한다.
- `render-tx.js`
  - `_loadMore()`에 `try/finally`를 적용해 실패해도 `STATE.loading`을 복구한다.
- Cache bust
  - `index.html`의 `app.js` query string을 새 변경값으로 갱신한다.
  - repo root에 `sw.js`/`STATIC_ASSETS`가 없으므로 `CACHE_VERSION` bump 대상은 없다.

## 제외

- Firestore schema/index 재설계
- 각 탭의 데이터 쿼리 분해/페이지네이션 대규모 개편
- 로그인/인증 흐름 변경
- 모달/상세 화면 디자인 변경

## 완료 기준

- 탭 클릭 후 지연/실패 상황에서 스피너만 무한히 남지 않고 재시도 UI가 표시된다.
- 거래 내역 로딩 실패 후에도 내부 로딩 플래그가 복구된다.
- 정적 검증과 프로젝트 검증이 통과한다.
- GitHub Pages 배포 또는 배포 차단 사유가 명확히 기록된다.

## 실행 결과

- 상태: 실행 완료
- 구현 파일: `app.js`, `render-tx.js`, `index.html`
- 문서 파일: `docs/ai/features/2026-06-01-tab-loading-watchdog.md`, `docs/ai/NEXT_ACTION.md`
- 변경 요약:
  - `app.js`의 탭 렌더를 `renderTab()` 공통 경로로 감싸고 렌더가 끝날 때까지 8초 간격으로 현재 스피너 영역을 재시도 가능한 로딩 지연 UI로 교체하게 했다.
  - 탭 렌더 실패 시 토스트만 띄우지 않고 탭 본문을 오류/재시도 UI로 교체하게 했다.
  - `refreshCurrentTab()`도 동일한 렌더 감시 경로를 사용하게 했다.
  - `render-tx.js`의 `_loadMore()`에 `try/finally`를 적용해 Firestore 요청 실패 후에도 `STATE.loading`이 복구되게 했다.
  - `index.html`의 `app.js` cache-bust와 `app.js`의 `render-tx.js` cache-bust를 `20260601-loading-watchdog`로 갱신했다.
- 검증:
  - `node --check app.js`: 통과
  - `node --check render-tx.js`: 통과
  - `npm.cmd run verify`: 통과
  - `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
  - `git diff --check`: 통과
- 실제 UI 검증: not verified yet. 프로젝트 지침상 sandbox에서 장기 dev server를 시작해 완료 검증으로 주장하지 않는다. 배포 후 앱 shell 및 cache-bust HTTP 확인을 진행한다.
