# 로딩/성능 안정화 진단 계획

## 요청

- Discord request: `devreq_discord_1510813727467765821`
- 증상: "누르면 무한 로딩중으로 보이는 화면들이 많음"
- 추가 피드백: "앱자체가 굉장히 무거워짐. 데이터로딩 왜이리느림"

## /diagnose

### 재현 루프

1. 코드 경로 기준으로 탭 전환 시 로딩 UI가 어떤 promise에 묶이는지 확인한다.
2. 정적 검증으로 `node --check`와 프로젝트 검증을 실행한다.
3. Pages artifact를 빌드하고 배포본에서 새 cache-bust와 HTTP 200을 확인한다.
4. 로그인된 실제 Firestore UI 클릭 검증은 이 환경에서 세션이 없으면 `not verified yet`로 남긴다.

### 반증 가능한 가설

1. 탭 렌더 promise가 네트워크 지연으로 resolve/reject되지 않으면 app-level watchdog은 지연 안내만 보여주고 hard failure로 전환하지 않아 무한 로딩처럼 보인다.
2. `showApp()`가 앱 화면 렌더 전 `getAppSettings()`와 modal import를 기다려 초기 진입이 체감상 무겁다.
3. `renderCart()`가 board shell을 그리기 전 `listCartCategories()`를 기다리고, 이후 같은 카테고리 조회를 다시 수행해 선택 탭 첫 화면이 늦게 뜬다.
4. `renderTx()`는 월간 1000건 캘린더 요약을 먼저 기다린 뒤 30건 리스트를 로드해, 큰 월 데이터에서 목록 표시가 불필요하게 지연된다.
5. 금융 탭의 여러 list 함수가 migration/preset ensure를 병렬로 반복 호출해 Firestore meta read/write가 중복된다.

## 실행 슬라이스 1 - 탭 로딩 hard timeout 및 중복 초기 로딩 축소

### 할 일

- `app.js`
  - 탭 렌더에 hard timeout을 추가해 일정 시간 후 재시도 가능한 실패 상태로 전환한다.
  - 앱 shell 표시와 첫 탭 렌더를 settings/modal preload보다 먼저 수행한다.
  - active 탭 렌더 중 같은 탭을 다시 누르면 중복 렌더를 막는다.
- `render-cart.js`
  - 선택 탭 shell을 먼저 그리고 카테고리/아이템/약속/감각뱅크/끌림 데이터를 한 번의 병렬 로드로 채운다.
- `render-tx.js`
  - 거래 첫 목록 로드와 월간 캘린더 요약 로드를 병렬화해 1000건 요약이 리스트 표시를 막지 않게 한다.
  - 요약 실패 시 목록까지 막지 않는 오류 상태를 표시한다.
- `data.js`
  - 금융 migration/preset ensure를 사용자 세션 단위 promise로 캐시해 한 화면에서 중복 실행되지 않게 한다.
- `index.html`, `app.js`, `render-home.js`
  - 변경된 JS가 배포본에서 다시 로드되도록 cache-busting query string을 갱신한다.

### 하지 않을 일

- Firestore 스키마 변경, 인덱스 변경, raw message 처리 변경은 하지 않는다.
- 홈 리포트의 데이터 모델이나 카테고리 UX는 바꾸지 않는다.
- 실제 로그인 계정의 운영 데이터 삭제/수정은 하지 않는다.

### 검증

- `node --check app.js`
- `node --check data.js`
- `node --check render-cart.js`
- `node --check render-tx.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `git diff --check`
- 배포 후 `https://aretenald2018-sys.github.io/budget/`, `app.js`, 변경 렌더러 모듈 HTTP 200 및 새 cache-bust 확인

## 다음 실행 시작점

이 계획 문서를 읽고 실행 슬라이스 1만 구현한다. 구현 후 정적 검증과 Pages 배포 확인을 수행하고, 실제 로그인 UI 클릭 검증이 불가능하면 `not verified yet`로 명시한다.

## 실행 결과

- 상태: 구현 완료, 리뷰 대기
- 변경 파일:
  - `app.js`
  - `data.js`
  - `render-cart.js`
  - `render-tx.js`
  - `render-home.js`
  - `index.html`
  - `docs/ai/NEXT_ACTION.md`
- 구현 내용:
  - 탭 렌더에 25초 hard timeout을 추가해 무한 spinner 대신 재시도 가능한 실패 UI로 전환한다.
  - 렌더 중 같은 탭 재클릭과 프로그램 refresh가 중복 Firestore 요청을 만들지 않도록 in-flight guard와 pending refresh 큐를 추가했다.
  - `showApp()`는 앱 shell/첫 탭을 먼저 표시하고 modal/settings preload는 백그라운드로 돌린다.
  - modal preload를 미루는 동안 빠른 클릭이 실패하지 않도록 `openTxEditModal`, `openTxAddModal`, `openCategoryModal`, `openAccountModal` fallback을 설치했다.
  - `getAppSettings()`는 같은 사용자 세션의 in-flight/result를 캐시해 홈 렌더와 앱 설정 preload의 중복 read를 줄인다.
  - 금융 migration/scenario preset ensure는 사용자 세션 단위 promise로 캐시해 금융 탭의 병렬 list 호출에서 중복 실행되지 않게 했다.
  - 선택 탭은 board shell을 먼저 표시하고 카테고리 조회를 `loadCartItems()`의 병렬 데이터 로드로 합쳤다.
  - 거래 탭은 월간 1000건 캘린더 요약을 목록 첫 batch와 분리해 목록 표시를 막지 않게 했다.
  - cache-bust 문자열을 `20260601-loading-perf`로 갱신했다.
- 검증:
  - `node --check app.js`: 통과
  - `node --check data.js`: 통과
  - `node --check render-cart.js`: 통과
  - `node --check render-tx.js`: 통과
  - `npm.cmd run verify`: 통과
  - `npm.cmd run pages:build`: 통과
  - `git diff --check`: 통과
- 실제 로그인 UI 검증: not verified yet. 이 환경에서 장기 dev server를 완료 검증으로 시작하지 않는 프로젝트 지침 때문에, 배포 후 로그인된 앱에서 탭 전환 체감과 25초 timeout UI를 확인해야 한다.
