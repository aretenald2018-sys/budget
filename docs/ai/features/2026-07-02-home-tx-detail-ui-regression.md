# 홈/거래 상세 UI 회귀 수정 계획

## 요청

- 홈 맨 위의 의미 없는 카드처럼 보이는 기간 카드와 `이번 달 고정비` 카드 폰트/크기를 바로잡는다.
- 거래 탭에서 세부항목을 눌렀을 때 `거래 상세` 모달 본문이 사라지는 문제를 고친다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-02-home-tx-detail-ui-regression.md`
- 원인은 탭 삭제 이후 CSS 일부 누락, 거래 상세 모달의 예외 방어 부족, 모달 로더의 컨테이너 전체 교체 방식이다.

## 그릴 결과

- 핵심 질문: 홈 CSS와 거래 상세 모달을 별도 슬라이스로 나눌지, 같은 회귀 수정으로 묶을지?
- 결정: 같은 실행 슬라이스에서 처리한다.
- 이유: 두 문제 모두 사용자가 같은 모바일 화면 회귀로 보고 있고, 수정 범위가 CSS/모달 UI 안정화에 한정된다.
- 남은 가정: 데이터 집계, 거래 저장 로직, Firestore schema는 변경하지 않는다.

## 실행 슬라이스 1 - 홈 카드와 거래 상세 모달 회귀 수정

### 목표

- 홈 기간 카드의 이전/다음 버튼과 상태 텍스트가 한 줄에 안정적으로 배치된다.
- `이번 달 고정비` 카드의 요약/행 텍스트가 작은 모바일 카드 안에서 과하게 커 보이지 않는다.
- 거래 목록/리포트 상세 거래를 눌렀을 때 거래 상세 모달 본문이 항상 로딩, 정상 상세, 오류 상태 중 하나로 표시된다.
- 모달 로더가 이미 생성된 동적 모달을 지우지 않는다.
- CSS/JS cache-busting query를 갱신한다.

### 예상 변경 파일

- `styles/60-urge.css`
- `modal-manager.js`
- `modals/tx-edit-modal.js`
- `style.css`
- `index.html`
- `app.js`
- 필요 시 `render-home.js`, `render-report.js`, `render-tx.js`
- `docs/ai/NEXT_ACTION.md`

### 범위 제외

- 거래 데이터/카테고리/집계 로직 변경
- Firestore 문서 백필
- 하단 탭 구성 변경
- 선택 탭 관련 추가 삭제

### 구현 메모

- `.report-month-nav .t6`에 `flex: 1`을 복구한다.
- 홈 전용 기간 카드와 고정비 카드 폰트 크기/line-height를 작은 화면 기준으로 명확히 고정한다.
- `loadAndInjectModals()`는 기존 동적 모달을 유지하고, 등록된 정적 모달만 누락 시 추가/교체한다.
- `openTxEditModal()`은 모달/본문 노드가 없으면 즉시 생성 또는 오류 toast로 빠지고, 본문 렌더 전체를 `try/catch`로 감싼다.
- 모달 상세 조회 실패 시 제목만 남기지 말고 오류 메시지와 다시 시도 버튼을 보여준다.
- 수정된 CSS/JS는 `20260702-home-tx-detail-fix` query로 갱신한다.
- 현재 repo에는 `sw.js`가 없으므로 `STATIC_ASSETS`/`CACHE_VERSION` bump 대상은 없다.

## 검증 계획

- `npm.cmd run verify`
- 정상 터미널에서 `npm.cmd run dev`
- `http://localhost:5501/` 접속
- 증명 기준:
  - 홈 첫 화면의 기간 카드가 한 줄 카드로 보이고 빈 카드처럼 보이지 않는다.
  - `이번 달 고정비` 카드의 요약/각 행 텍스트가 작은 폰트로 정렬된다.
  - 거래 탭에서 거래 한 건을 눌렀을 때 거래 상세 본문이 표시된다.
  - 리포트/홈 카테고리 내역에서 거래 한 건을 눌러도 거래 상세 본문이 표시된다.
  - 콘솔에 `tx-edit-body` null, 모달 누락, 상세 렌더 중단 오류가 없다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-02-home-tx-detail-ui-regression.md`
- `npm.cmd run verify` 통과.
- 실제 브라우저 UI 검증은 not verified yet. 정상 터미널에서 dev server를 시작한 뒤 홈 카드와 거래 상세 모달 클릭 흐름 확인이 필요하다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-02-home-tx-detail-ui-regression.md`의 실행 슬라이스 1만 구현한다. 홈 CSS, 모달 로더, 거래 상세 모달 방어, cache-busting만 수정하고 데이터/집계 로직은 변경하지 않는다.
