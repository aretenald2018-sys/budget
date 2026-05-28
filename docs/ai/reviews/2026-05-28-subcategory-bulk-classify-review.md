# 상세분류 미지정 일괄 분류 리뷰

## 결과

- 상태: 조건부 통과
- 범위: 카테고리 상세 모달의 `상세분류 미지정` 요약 행에서 미지정 거래를 선택해 기존 상세분류로 일괄 저장

## 확인한 것

- `render-report.js`의 `상세분류 미지정` 요약 행은 버튼으로 렌더링되고 `data-report-action` 위임 리스너로 중첩 모달을 연다.
- 중첩 모달은 현재 카테고리의 미지정 거래만 목록으로 보여주고, 전체 선택/개별 선택/상세분류 선택/저장 흐름을 제공한다.
- 저장은 선택 거래별 `updateTransaction(txId, { subcategory })`를 호출하고, 로컬 `STATE.monthTxs`/`STATE.cycleTxs`를 패치한 뒤 기존 카테고리 상세 모달을 새로 그린다.
- `styles/20-records.css`, `style.css`, `app.js`, `index.html`의 캐시 버전을 함께 갱신했다.

## 검증

- `node --check render-report.js`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (96 JS files checked).`
- `git diff --check -- ...`: 통과
- 실제 브라우저 플로우: not verified yet. `http://localhost:5501/`, `http://localhost:5502/`가 응답하지 않았고 in-app browser의 `iab` 대상도 사용할 수 없어 모달 클릭/저장 UI를 직접 행사하지 못했다.

## 잔여 리스크

- 실제 Firebase 데이터가 있는 화면에서 `상세분류 미지정` 클릭, 거래 선택, 저장 후 요약/거래 메타 갱신을 확인해야 한다.
- 해당 카테고리에 상세분류 후보가 하나도 없으면 저장 버튼은 비활성화된다. 이 경우 거래 상세 편집에서 상세분류를 먼저 추가해야 한다.
