# 포인트 정산 신규내역 CRUD 노출 계획

## 요청

설정 화면의 `보상 적립 > 포인트 항목` 영역에서 포인트 항목 CRUD는 보이지만, 이전에 말한 `신규내역` CRUD가 보이지 않는다.

## 진단 결과

- 적용 트리거: `/diagnose`
- 사용자가 첨부한 화면은 `render-settings.js`의 `reward-settings-form` 안에 있는 `포인트 항목` 편집 영역이다.
- 이전 계획 `docs/ai/features/2026-07-08-reward-point-settlement-negative-balance.md`는 포인트 사용/정산 내역을 별도 컬렉션이 아니라 기존 `transactions.rewardPointEntry` metadata로 저장하도록 결정했다.
- 현재 거래 탭에는 `render-tx.js`의 FAB `window.openTxAddModal()`이 있고, `modals/tx-edit-modal.js`에는 `포인트 정산` 패널, 저장, 수정, 삭제 경로가 있다.
- 하지만 설정 화면에는 `rewardPointEntry` 거래를 읽어 보여주는 목록도, 설정 맥락에서 `openTxAddModal()`을 여는 `신규내역` 액션도 없다.

## 가설과 증거

1. 설정 화면에서 CRUD가 사라진 것이 아니라 거래 탭에만 숨어 있다.
   - 증거: `render-settings.js`는 `rewardSavings.pointItems`만 렌더링하고 `listTransactions()`를 호출하지 않는다.
   - 판정: 확인.
2. 거래 추가/수정 모달의 포인트 정산 패널이 런타임에서 비활성화된다.
   - 증거: `modals/tx-edit-modal.js`는 `getAppSettings().rewardSavings.pointItems`를 읽고 point item이 있으면 select를 활성화한다.
   - 판정: 현재 코드상 핵심 원인은 아님. 브라우저 QA에서 다시 확인한다.
3. 저장된 포인트 정산 거래가 거래 목록이나 홈 잔액에 반영되지 않아 CRUD가 없는 것처럼 보인다.
   - 증거: `render-tx.js`는 포인트 badge와 `rewardPointEntryMeta()`를 렌더링하고, 이전 검증 fixture는 음수 잔액 계산을 통과했다.
   - 판정: 현재 코드상 핵심 원인은 아님. 설정 화면 scoped read가 빠져 있다.

## 결정

- 새 Firestore 컬렉션을 만들지 않는다.
- `transactions.rewardPointEntry` 기반 CRUD를 그대로 재사용한다.
- 설정의 `보상 적립` 카드 안에 `포인트 정산 내역` 영역을 추가한다.
- `+ 신규내역`은 기존 `openTxAddModal()`을 포인트 정산 모드로 열어 create를 담당한다.
- 내역 row 클릭은 기존 `openTxEditModal(txId)`로 연결해 read/update/delete를 담당한다.

## 실행 슬라이스 1: 설정 화면에 포인트 정산 내역 CRUD 진입점 추가

- 상태: 승인됨, 바로 실행
- 범위:
  - `render-settings.js`
    - 현재 월 거래 중 `rewardPointEntry`가 있는 거래를 읽고 `포인트 정산 내역` 목록을 렌더링한다.
    - `+ 신규내역` 버튼을 추가한다.
    - 내역 row 클릭 시 `window.openTxEditModal(txId)`로 상세/수정/삭제를 연다.
  - `modals/tx-edit-modal.js`
    - `openTxAddModal(options)`가 포인트 정산 모드로 열릴 수 있게 한다.
    - 설정에서 열린 경우 `포인트 정산` 체크박스를 기본 활성화하고 첫 포인트 항목을 선택한다.
  - `styles/60-urge.css`
    - 설정 카드 안 `포인트 정산 내역` 목록과 빈 상태를 기존 토큰으로 스타일링한다.
  - `style.css`, `index.html`, `app.js`, `modal-manager.js`
    - 수정된 CSS/JS가 production에서 재로딩되도록 cache-bust 문자열을 갱신한다.
  - `scripts/verify-project.mjs`
    - 설정 화면에 `포인트 정산 내역`, `+ 신규내역`, row edit 액션, 포인트 정산 모드 modal token이 있는지 검증한다.
- 수정하지 말 것:
  - `transactions.rewardPointEntry` schema를 바꾸지 않는다.
  - 기존 `포인트 항목` CRUD 입력 구조를 바꾸지 않는다.
  - 실제 사용자 production 데이터에 임시 거래를 저장/삭제하지 않는다. 사용자가 명시 허용하기 전까지 저장 QA는 fixture/브라우저 DOM 확인까지만 한다.
  - Android 위젯과 홈 음수 잔액 계산은 이번 slice에서 재설계하지 않는다.

## 검증 방법

- 소스 검증:
  - 설정 화면 token 검증: `포인트 정산 내역`, `+ 신규내역`, `data-reward-entry-action`, `rewardEntryRows`.
  - 모달 token 검증: `openTxAddModal(options = {})`, `resolveInitialRewardPointEntry`, `forceRewardPointEnabled`.
- 명령:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
- 브라우저 QA:
  - Pages artifact 또는 production UI에서 설정 탭 진입.
  - `보상 적립` 영역에 `포인트 정산 내역`과 `+ 신규내역`이 보이는지 확인.
  - `+ 신규내역`을 누르면 `포인트 정산 추가` sheet가 열리고 `포인트 정산`이 활성화되어 있는지 확인.
  - 기존 내역 row가 있으면 row 클릭으로 거래 상세가 열리는지 확인.
  - 저장/삭제는 production 재정 데이터 변경이므로 사용자 허용 전에는 실행하지 않는다.

## 완료 조건

- 사용자가 screenshot으로 지적한 설정 화면에서 `신규내역` CRUD 진입점이 보인다.
- create는 포인트 정산 모드 거래 추가 sheet로 연결된다.
- read/update/delete는 포인트 정산 내역 row와 기존 거래 상세 sheet로 연결된다.
- `npm.cmd run verify`, `npm.cmd run pages:build`가 통과한다.
- 브라우저에서 실제 설정 화면과 modal open flow를 확인한다.
