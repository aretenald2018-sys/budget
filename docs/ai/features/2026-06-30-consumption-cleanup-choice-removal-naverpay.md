# 소비 탭 정리, 선택 탭 제거, 네이버페이 보강 계획

## 배경

이번 요청은 앱의 행동 방향을 바꾼다.

- `선택` 탭 관련 기능/UI/탭을 삭제한다. 사유는 미사용이며 정신건강에 오히려 좋지 않음.
- `거래` 탭 이름을 `소비`로 바꾼다.
- `토스 김태우`로 보낸 자전거래는 소비 집계에서 자동 제외한다.
- `검토` 탭에 남는 `네이버페이 충전` 건이 실제 네이버페이/Gmail 결제 내역으로 바뀌지 않는 원인을 고치고 싶다.

## 진단 요약

상세 진단은 `docs/ai/diagnoses/2026-06-30-naverpay-topup-review-blocker.md`에 남겼다.

- 네이버페이 SMS 파서는 현재 샘플 `결제완료안내`를 실제 결제 금액으로 정상 파싱한다.
- SMS/raw ingest duplicate 경로는 `네이버페이 충전`과 `네이버페이 실제 결제`를 amount가 달라도 10분 안이면 합칠 수 있다.
- 그러나 Gmail receipt 경로는 네이버페이 결제 rail을 모른다.
- `api/gmail-poll.js`는 네이버페이 발신자를 명시적으로 수집하지 않고, `api/_lib/receipt-parser.js`의 source schema에도 `naverpay`가 없다.
- `api/_lib/receipt-enricher.js`는 같은 amount 거래만 찾고, 쿠팡에만 같은 날짜 fallback을 둔다. 그래서 `충전 60000원 -> 실제 결제 9000원` 같은 케이스를 기존 충전 거래에 적용하지 못한다.

## 그릴 결과

### 핵심 질문 1

`선택` 탭 삭제가 과거 데이터 삭제까지 뜻하는가?

결정: 앱 UI/진입점/생성 경로/검증 규칙/배포 아티팩트에서 선택 탭을 제거한다. Firestore의 기존 `cart_items`, `cart_categories`, `pacts`, `mindbank` 데이터는 삭제하지 않는다.

이유: 프로젝트 규칙상 raw나 사용자 데이터를 임의 삭제하지 않는다. 데이터 삭제는 되돌리기 어렵고, 이번 요청의 핵심은 앱에서 해당 기능을 더 이상 보지 않게 하는 것이다.

### 핵심 질문 2

`끌림 들여다보기`와 `감각뱅크`까지 제거해야 하는가?

결정: 이번 계획에서는 `선택` 탭과 직접 연결되는 보류함/cart/pact UI 및 `switchTab('cart')` 진입만 제거한다. `끌림 들여다보기`와 `감각뱅크` 탭 자체는 별도 탭이므로 유지하되, `약속으로 미루기`처럼 `cart`로 이동하는 생성/버튼은 비활성화하거나 `mindbank`/`home`으로 안전하게 되돌린다.

남은 가정: 사용자가 다음에 감각뱅크/끌림도 정신건강에 좋지 않다고 명시하면 별도 삭제 계획으로 다룬다.

### 핵심 질문 3

`토스 김태우` 제외는 거래 원본 타입을 바꿀 것인가, 소비 집계에서만 제외할 것인가?

결정: 원본 거래는 보존하고 `excludedFromBudget: true`, `excludeReason: "self_transfer_toss_kim_taewoo"` 같은 명시 필드로 소비 집계에서 제외한다. 새 유입 자동 판정과 기존 표시 집계 모두 같은 helper를 쓰게 한다.

## 실행 슬라이스

### 슬라이스 1 - 네이버페이 충전-실결제 보강 복구

목표:

- Gmail/영수증 또는 다른 보강 경로에서 네이버페이 실제 결제 내역을 확인하면, `네이버페이 충전` 거래를 실제 결제 금액/가맹점으로 바꾼다.
- 검토 탭의 해결 가능한 `네이버페이 충전` 잔존을 줄인다.

예상 변경 파일:

- `api/gmail-poll.js`
- `api/_lib/receipt-parser.js`
- `api/_lib/receipt-enricher.js`
- `utils/naverpay.js`
- 필요 시 `data.js`, `render-review.js`
- 테스트/검증 스크립트가 있으면 관련 파일

구현 범위:

- parser source에 `naverpay` 허용.
- Gmail query에 네이버페이 결제 메일을 놓치지 않는 sender/keyword 후보 추가.
- receipt enricher에서 `naverpay` 영수증이 같은 amount 거래를 못 찾으면 네이버페이 충전 거래를 시간창/날짜창으로 찾고, 실제 결제 금액/가맹점으로 patch한다.
- 이미 `paymentRailResolved: true`로 합쳐진 거래는 중복 생성하지 않는다.

하지 않을 것:

- raw message 삭제.
- 실제 결제 원천이 없는 충전 거래를 임의 금액으로 바꾸기.
- 선택 탭 제거를 이 슬라이스에 섞기.

검증:

- 네이버페이 SMS 샘플 파서 스모크: `결제완료안내 ... 900원`이 `paymentRail: "naverpay"`로 파싱된다.
- 네이버페이 Gmail/receipt fixture가 `source: "naverpay"`와 실제 amount를 만든다.
- 기존 `네이버페이 충전 60000원` + 실제 결제 `9000원` fixture에서 transaction이 1건으로 남고 amount/merchant가 실제 결제로 바뀐다.
- `npm.cmd run verify` 또는 해당 repo 검증 명령을 정상 터미널에서 실행한다.

### 슬라이스 2 - 소비 집계에서 토스 김태우 자전거래 제외 및 거래 탭 명칭 변경

목표:

- `토스 김태우` 송금을 소비 합계, 리포트, CSV export 등 소비성 집계에서 제외한다.
- 하단 탭과 화면 라벨의 `거래` 탭 이름을 `소비`로 바꾼다.

예상 변경 파일:

- `data.js`
- `render-tx.js`
- `render-report.js`
- `scripts/export-calendar-csv.mjs`
- `api/_lib/auto-ingest.js`
- `api/_lib/server-parser.js`
- `client-parse.js`
- `index.html`
- `app.js`
- 필요 시 `modals/tx-edit-modal.js`, 문구가 있는 CSS/문서

구현 범위:

- `토스 김태우` 판정 helper를 추가하고 소비 집계 helper에서 제외한다.
- 새로 들어오는 `transfer_out` 거래가 `토스 김태우`면 `excludedFromBudget`/`excludeReason`을 자동 저장한다.
- 이미 표시되는 화면 집계는 helper를 통해 즉시 제외되게 한다.
- 탭 라벨 `거래`를 `소비`로 변경한다. 내부 tab id `tx`는 URL/코드 안정성을 위해 유지한다.

하지 않을 것:

- 모든 `토스` 송금을 제외하지 않는다.
- `토스 김윤슬`, `토스 경찰청＿` 등 다른 수취인은 이번 자동 제외에 포함하지 않는다.
- 과거 Firestore 문서를 대량 수정하는 백필은 별도 확인 후 진행한다.

검증:

- `토스 김태우` fixture가 소비 합계에서 제외된다.
- 다른 `transfer_out`은 기존처럼 소비성 거래로 남는다.
- 하단 탭과 헤더/검토 이동 문구가 `소비`로 보인다.
- `npm.cmd run verify` 또는 해당 repo 검증 명령을 정상 터미널에서 실행한다.

### 슬라이스 3 - 선택 탭 및 직접 관련 기능/UI 제거

목표:

- 앱에서 `선택` 탭이 사라지고, 사용자가 `cart`/선택 보류함/선택 상세/선택 공유 target으로 들어갈 수 없게 한다.
- 선택 탭 전용 CSS/JS/검증/Pages copy 대상도 정리한다.

예상 변경 파일:

- `index.html`
- `app.js`
- `style.css`
- `scripts/build-pages.mjs`
- `scripts/verify-project.mjs`
- `manifest.webmanifest`
- `android/src/com/aretenald/budget/MainActivity.java`
- `render-report.js`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-result.js`
- `render-cart.js` 삭제 또는 미사용 처리
- `choice/` 모듈 삭제 또는 미사용 처리
- `styles/30-cart-board.css`, `styles/40-cart-choice.css`, 선택 전용 `styles/50/70/80` 블록 정리

구현 범위:

- `TABS`에서 `cart` 제거.
- `TAB_LABELS.cart`, `renderCart` import, `hasCartSharePayload()`, `switchTab('cart')` 경로 제거 또는 안전 fallback.
- `index.html`의 `#tab-cart` 섹션과 하단 `선택` 버튼 제거.
- `style.css`에서 선택 탭 전용 CSS import 제거.
- `scripts/build-pages.mjs`가 `render-cart.js`와 `choice/`를 Pages artifact에 복사하지 않게 한다.
- `scripts/verify-project.mjs`의 selection-tab split 강제 규칙을 삭제 후 상태에 맞게 바꾼다.
- PWA/Android share target의 `shareTarget=cart` 경로를 제거하거나 앱 홈으로 보낸다.
- 감각뱅크/끌림 탭의 `switchTab('cart')` 버튼은 제거하거나 `mindbank`/`home`으로 바꾼다.

하지 않을 것:

- Firestore의 기존 `cart_items`, `cart_categories`, `pacts`, `mindbank` 데이터를 삭제하지 않는다.
- `감각뱅크`와 `끌림 들여다보기` 탭 자체 삭제는 이번 슬라이스에 포함하지 않는다.
- 네이버페이/토스 제외 로직 변경을 이 슬라이스에 섞지 않는다.

검증:

- 앱 첫 화면과 하단 nav에 `선택`이 없다.
- `?shareTarget=cart`로 접속해도 선택 UI가 열리지 않고 안전한 화면으로 이동한다.
- 홈/감각뱅크/끌림에서 `switchTab('cart')` 콘솔 오류가 없다.
- `npm.cmd run verify` 또는 해당 repo 검증 명령을 정상 터미널에서 실행한다.
- 실제 UI 검증은 사용자가 정상 터미널에서 dev server를 시작한 뒤 `http://localhost:5501/`에서 확인한다.

## 공통 검증/운영 주의

- 이 저장소에는 현재 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 검색되지 않는다. 실행 시 다시 확인하고, 없으면 서비스워커 bump 대상 없음으로 기록한다.
- CSS/JS를 바꾸면 `index.html`과 동적 import query string을 함께 갱신한다.
- sandbox에서 장기 dev server를 시작하지 않는다. 최종 안내는 `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run dev`를 사용한다.
- 완료 판정은 `HTTP 200`만으로 하지 않는다. 로그인 후 실제 UI 상태 확인이 필요하다.

## 다음 실행 프롬프트

`docs/ai/features/2026-06-30-consumption-cleanup-choice-removal-naverpay.md`의 슬라이스 1만 실행하라. 먼저 네이버페이 Gmail/receipt 보강 경로가 `네이버페이 충전` 거래를 실제 결제 금액/가맹점으로 바꾸도록 고치고, SMS raw ingest의 기존 네이버페이 merge는 회귀시키지 마라. 앱 코드 변경 후 검증 결과와 리뷰 대상을 `docs/ai/NEXT_ACTION.md`에 남겨라.
