# 2026-06-30 네이버페이 충전 검토 잔존 진단

## 요청

- `검토` 탭에 `네이버페이 충전` 관련 건이 많이 남아 있다.
- 원래 의도는 네이버페이 충전 금액을 소비로 그대로 보지 않고, 네이버페이/Gmail/다른 경로에서 확인되는 실제 결제 금액과 사용처로 바꾸는 것이었다.
- 지금 어디서 막혔는지 확인한다.

## 재현/피드백 루프

1. 코드 경로 검색:
   - `utils/naverpay.js`
   - `api/_lib/auto-ingest.js`
   - `client-parse.js`
   - `api/gmail-poll.js`
   - `api/_lib/receipt-parser.js`
   - `api/_lib/receipt-enricher.js`
   - `render-review.js`
2. 샘플 SMS 파서 스모크:
   - 명령: `node --input-type=module -e "...parseNaverPayAutoPaymentMessage..."`
   - 입력: `[네이버페이]결제완료안내 티맵모… '[티맵 주차] …' 900원 http://naver.me/PayO`
   - 결과: `amount: 900`, `paymentRail: "naverpay"`, `paymentRailResolved: true`로 파싱됨.
3. 충전 거래와 샘플 실제 결제의 merge patch 확인:
   - `네이버페이 충전 60000원` + `네이버페이 결제완료 900원`
   - 결과: `amount: 900`, `originalMerchant: "네이버페이 충전"`, `naverPayTopupMerged: true`, `naverPayTopupAmount: 60000` 패치 생성됨.

## 확인된 사실

1. SMS 기반 `자동결제안내`/`결제완료안내` 파서는 현재 샘플을 정상 파싱한다.
   - `utils/naverpay.js`는 두 안내 문구를 모두 인식한다.
   - 파싱 결과는 `paymentRail: "naverpay"`, `paymentRailResolved: true`를 가진다.
2. raw ingest 중복 처리 경로는 네이버페이 충전과 실제 결제를 같은 결제 레일 pair로 볼 수 있다.
   - `api/_lib/auto-ingest.js`와 `data.js`의 duplicate 탐색은 amount가 달라도 10분 시간창 안의 `네이버페이 충전` + `네이버페이 실제 결제`를 찾는다.
   - 충전이 먼저 저장되고 실제 결제 문자가 나중에 들어오면 기존 충전 거래가 실제 결제 금액/가맹점으로 갱신된다.
3. Gmail receipt 경로는 이 네이버페이 pair 로직을 사용하지 않는다.
   - `api/_lib/receipt-enricher.js::findMatchingTransaction()`은 기본적으로 같은 `amount` 또는 `sharedPayment.originalAmount`만 찾고, 시간창도 30분이다.
   - 이후 fallback도 `isCoupangReceiptDoc()`인 경우에만 같은 날짜의 쿠팡 거래를 더 넓게 찾는다.
   - 따라서 `네이버페이 충전 60000원`이 있고 Gmail/영수증의 실제 결제가 `9000원`이면 기존 충전 거래는 후보에 오르지 않는다.
4. Gmail polling 대상과 parser schema도 네이버페이에 특화되어 있지 않다.
   - `api/gmail-poll.js`의 `SENDERS`에는 카카오페이/배민/쿠팡/이지페이/KCP 계열은 있지만 네이버페이 전용 발신자가 없다.
   - `api/_lib/receipt-parser.js` schema의 `source`는 `kakaopay | baemin | coupangeats | coupang | unknown`만 허용하고, `naverpay`가 없다.
   - deterministic parser도 쿠팡/이지페이/KCP 중심이다.
5. 검토 탭 잔존의 직접 원인은 `네이버페이 충전` 거래가 `paymentRailResolved !== true` 상태로 남기 때문이다.
   - `data.js::needsPaymentRailReview()`는 `isNaverPayTopup(tx) && tx.paymentRailResolved !== true`를 검토 대상으로 본다.
   - 실제 결제 SMS 또는 보강 영수증이 들어오지 않았거나 매칭되지 않으면 계속 검토 대상에 남는다.

## 반증 가능한 가설과 판정

1. 가설 A: 네이버페이 SMS 파서가 결제완료 문자를 못 읽는다.
   - 판정: 현재 코드 기준 반증됨. 샘플 파싱은 정상이다.
2. 가설 B: 충전-실결제 merge 로직이 없다.
   - 판정: 반증됨. raw ingest duplicate 경로에는 존재한다.
3. 가설 C: Gmail receipt 경로가 네이버페이 충전 거래를 실제 결제로 바꾸지 못한다.
   - 판정: 지지됨. amount 동일 매칭 중심이고 네이버페이 rail pair 처리가 없다.
4. 가설 D: Gmail poll이 네이버페이 결제 메일을 충분히 가져오지 못한다.
   - 판정: 지지됨. 명시 sender/source/parser 지원이 없다.
5. 가설 E: 과거에 이미 `skipped` 처리된 네이버페이 raw가 새 코드로 자동 재처리되지 않는다.
   - 판정: 가능성 있음. 기존 `2026-06-01-naverpay-completed-skipped-reprocess.md` 진단과 같은 계열이다.

## 결론

현재 막힌 지점은 SMS 파서 자체가 아니라 두 군데다.

1. Gmail/영수증 보강 파이프라인이 `naverpay`를 1급 source/paymentRail로 다루지 않아 `네이버페이 충전` 거래를 실제 결제 금액으로 바꾸지 못한다.
2. 운영 데이터에 이미 남은 `네이버페이 충전` 거래는 실제 결제 raw/receipt가 없거나, 있어도 위 매칭 경로에 걸리지 않으면 계속 `needsReview`에 남는다.

## 수정 방향

- `receipt-parser`/`gmail-poll`에 네이버페이 결제 메일 후보를 추가하고, parser schema에 `naverpay`를 허용한다.
- `receipt-enricher`가 `source === "naverpay"` 또는 merchant/paymentRail 단서가 있는 영수증을 처리할 때, 같은 금액 매칭 실패 후 네이버페이 충전 거래를 시간창/날짜창으로 찾아 `buildNaverPayDuplicateMergePatch()`와 동등한 패치를 적용한다.
- 이미 남은 `네이버페이 충전` 검토 건은 별도 백필/재처리 스크립트로 처리한다. raw/receipt가 없는 건은 자동으로 실제 소비 금액을 알 수 없으므로 검토 또는 제외 규칙이 필요하다.
