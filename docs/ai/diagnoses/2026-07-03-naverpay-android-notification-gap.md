# 네이버페이 결제완료 Android 알림 누락 진단

## 요청

- Discord request: `devreq_discord_1510801802621223003`
- 증상: `[네이버페이]결제완료안내 티맵모… '[티맵 주차] …' 900원 http://naver.me/PayO`가 가계부에 잡히지 않음.

## 재현 루프

- 기존 `utils/naverpay.js` 파서에 샘플을 넣으면 `amount: 900`, `merchant: "티맵모… '[티맵 주차] …'"`, `paymentRail: "naverpay"`, `paymentRailResolved: true`로 파싱된다.
- 현재 아키텍처는 phone raw backend ingest를 제거하고 Android `NotificationListenerService` 로컬 큐 + WebView 저장으로 바뀌었다.
- 새 Android 경로의 `PaymentNotificationParser.java`는 결제 후보와 금액은 찾지만 네이버페이 결제완료 문자를 전용으로 정규화하지 않는다.

## 가설 검증

1. 기존 JS 네이버페이 파서가 샘플을 놓친다.
   - 반증: 로컬 스모크에서 샘플이 정상 파싱된다.
2. 새 Android 알림 파서가 금액을 못 찾는다.
   - 반증: `900원`은 현재 `AMOUNT_RE`가 찾을 수 있다.
3. 새 Android 알림 파서가 네이버페이 전용 필드를 만들지 않는다.
   - 확인: `PaymentNotificationParser.java`는 `paymentRail`, `paymentRailResolved`, `actualMerchant`, 네이버페이 전용 `reason`을 emit하지 않는다.
4. WebView 저장 매핑이 native capture의 rail 필드를 버린다.
   - 확인: `app.js::transactionFromAndroidCapture()`는 capture의 `paymentRail` 계열 필드를 transaction payload로 전달하지 않는다.
5. WebView flush가 네이버페이 충전 pair를 중복으로만 처리한다.
   - 확인: `findSimilarTransaction()`이 네이버페이 충전 거래를 반환해도 `app.js`는 기존 거래를 실제 결제 금액/가맹점으로 patch하지 않고 `duplicate` ack만 한다.

## 결론

누락의 현재 원인은 기존 SMS/backend 파서 문제가 아니라 새 Android 로컬 알림 경로의 정규화 공백이다. 샘플 형식은 결제 알림으로 잡힐 수 있지만 네이버페이 결제완료로 확정되지 않아 가맹점과 충전 매칭 정보가 불안정하다.

## 수정 방향

- `PaymentNotificationParser.java`에 네이버페이 결제완료/자동결제 안내 전용 감지와 merchant 추출을 추가한다.
- native capture에 `paymentRail: "naverpay"`, `paymentRailResolved: true`, `actualMerchant`, `reason`을 포함한다.
- `app.js`가 native capture의 rail 필드를 transaction에 보존하게 한다.
- `findSimilarTransaction()`이 네이버페이 충전 pair를 찾으면 기존 충전 거래를 `buildNaverPayDuplicateMergePatch()` 결과로 갱신한다.
- `scripts/verify-project.mjs`에 샘플 문자열 회귀 검증을 추가한다.
