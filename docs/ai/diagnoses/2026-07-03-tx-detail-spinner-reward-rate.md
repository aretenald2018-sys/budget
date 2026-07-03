# 거래 상세 로딩과 적립배분율 하한 진단

## 요청

- 특정 거래를 누르면 `거래 상세` 바텀시트가 로딩 스피너에서 멈춘다.
- 설정의 `적립 배분율`을 5% 미만으로 설정할 수 없다.

## 확인

- 운영 배포본의 `modals/tx-edit-modal.js`는 상세 로딩 중 예외가 나도 스피너를 오류 상태로 바꾸는 방어가 없었다.
- 로컬 파일에는 전체 try/catch가 들어가 있었지만, `tx.receiptIds`가 있으면 `Promise.all(getReceipt)` 한 건 실패만으로 거래 상세 전체 렌더가 실패하는 구조가 남아 있었다.
- `render-settings.js`의 적립 배분율 입력은 `min="0"`로 고쳐져야 한다.
- `data.js` 저장 경계와 `utils/reward-savings.js` 계산 경계는 `0..1` 비율을 허용해야 한다.
- `render-settings.js`에 금지된 `budget-snowy-iota.vercel.app` fallback URL이 남아 `npm.cmd run verify`가 실패했다.

## 원인

1. 거래 상세 바텀시트는 거래 본문과 연결 영수증을 한 번에 렌더링한다. 연결 영수증 조회 실패가 거래 상세 전체 실패로 전파될 수 있다.
2. 적립배분율은 UI 입력, 저장 정규화, 홈 카드 계산이 모두 같은 하한 정책을 가져야 하는데 화면/저장 경계가 분리되어 있었다.
3. 배포 캐시 query string이 갱신되지 않으면 운영 브라우저가 이전 모달/설정 코드를 계속 로드할 수 있다.

## 판정

- 이번 수정 범위는 거래 상세 바텀시트 로딩 방어, 적립배분율 `0%` 이상 허용, 관련 모듈 cache-bust 갱신이다.
- production push 전까지 운영 UI는 `not verified yet`이다.
