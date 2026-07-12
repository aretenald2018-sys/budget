# 앱 전체 리팩토링 슬라이스 3 리뷰

## 결론

- 슬라이스 3 완료. 거래, 영수증, 보상 계산의 환경 독립 규칙을 `domain/` 소유 모듈로 분리했다.
- 브라우저 repository, Gmail 서버 처리, Actions/관리 스크립트가 동일한 순수 함수를 사용한다.
- 기존 Firestore 문서나 과거 거래는 수정하지 않았고, production 검증도 읽기와 모달 취소만 수행했다.
- 차단 회귀는 발견되지 않았다. 슬라이스 4 대형 화면 feature 모듈 분리로 진행할 수 있다.

## 변경 경계

- `domain/transactions/budget.js`: 예산 제외, 환급 예정, 표시 카테고리, 네이버페이 보완 판정.
- `domain/transactions/shared-payment.js`: 공동결제 제안, 인원수 정규화, 분할 금액과 rule 적용.
- `domain/transactions/naverpay.js`, `self-transfer.js`: 네이버페이 충전+구매 병합과 토스 본인 이체 제외의 canonical owner.
- `domain/receipts/rules.js`: 쿠팡 품목 분류, 영수증 메모 생성/병합, 카테고리 별칭 판정.
- `domain/rewards/savings.js`: 보상 기준선, 포인트 원장 합산, 일일 카드와 Android widget snapshot.
- 기존 `utils/naverpay.js`, `utils/self-transfer.js`, `utils/reward-savings.js`는 현재 import 호환용 re-export만 유지한다.

## 계약과 회귀 방지

- `test/fixtures/transaction-rules.json`: self-transfer, 네이버페이 문자/병합, 예산 제외/환급, 부분 환급 metadata의 현재 전체-record 제외, 공동결제 제안을 고정한다.
- `test/fixtures/receipt-contract.json`: Gmail+Android memo 병합, 쿠팡 품목 분류, 중복 receipt link를 고정한다.
- `test/fixtures/reward-contract.json`: 기준 소비, 포인트 적립률과 월 예상값을 고정한다.
- verifier가 browser/server/script consumer의 canonical `domain/` import와 중복 함수 재선언 금지를 검사한다.
- cache release `20260712-domain-rules`를 data entry, 거래 repository, reward renderer, 동적 modal data version에 전파했다.

## 검증

- `npm.cmd test`: 15/15 통과.
- `npm.cmd run verify`: 통과, 109개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- GitHub Pages workflow [29186679106](https://github.com/aretenald2018-sys/budget/actions/runs/29186679106): build/deploy 성공.
- production `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production 자산 `data.js`, `domain/transactions/budget.js`, `domain/receipts/rules.js`, `domain/rewards/savings.js`: 각각 HTTP 200.
- 로그인된 production UI에서 다음을 실제로 확인했다.
  - 홈: 격주 조절비와 보상 기준선/포인트 3개가 로드됨.
  - 거래: 7월 지출 합계 1,374,942원, 환급 22,400원과 달력 환급 표시.
  - 영수증 결과: 쿠팡 거래의 `식재료비`/`생활용품` 상세분류가 유지됨.
  - 거래 상세: 공동결제 2/3/4명 선택, 환급예정 control, 금액/카테고리/메모가 로드됨.
  - 취소 버튼으로 저장 없이 상세 모달이 닫힘.

## 커밋

- `0e0f5ba` Extract pure transaction domain rules
- `83aea5c` Unify browser and server receipt rules
- `943b5db` Move reward calculations into domain layer
- `e9e84e9` Make transaction domain the canonical rule owner
- `0e981f8` Version pure domain rule release
- `260faf4` Characterize partial reimbursement metadata

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 4에서 `render-report.js`부터 상태, view, event/controller 경계를 순서대로 분리한다.
