# 네이버페이 Android 알림 정규화 수정 계획

## 배경

Discord 요청 `devreq_discord_1510801802621223003`에서 `[네이버페이]결제완료안내 티맵모… '[티맵 주차] …' 900원` 문자가 가계부에 잡히지 않는다고 보고했다. 과거 SMS/backend 경로의 JS 파서는 이 샘플을 처리하지만, 현재 프로젝트는 Android 로컬 알림 수집 경로로 재구성되어 새 native parser와 WebView 저장 매핑이 실제 진입점이다.

## 진단 요약

- 기존 `utils/naverpay.js`는 샘플을 `amount: 900`, `merchant: "티맵모… '[티맵 주차] …'"`, `paymentRail: "naverpay"`로 파싱한다.
- 새 `PaymentNotificationParser.java`는 결제 후보/금액은 잡지만 네이버페이 결제완료 전용 필드를 만들지 않는다.
- `app.js::transactionFromAndroidCapture()`도 native capture에 rail 정보가 있어도 transaction payload로 보존하지 않는다.

## 실행 슬라이스 1 - Android 알림 네이버페이 결제완료 정규화

목표:
- 요청 샘플이 Android local notification capture에서 네이버페이 실제 결제로 정규화되어 거래 저장/충전 매칭 경로를 탈 수 있게 한다.

수정 범위:
- `android/src/com/aretenald/budget/PaymentNotificationParser.java`
- `app.js`
- `scripts/verify-project.mjs`
- 실행/리뷰/NEXT_ACTION 문서

구현:
- native parser에 네이버페이 결제완료/자동결제 안내 패턴을 추가한다.
- URL을 제외하고 마지막 금액 앞의 결제처를 merchant로 추출한다.
- native capture JSON에 `paymentRail`, `paymentRailResolved`, `actualMerchant`, `reason`을 넣는다.
- WebView transaction payload가 `paymentRail`, `paymentRailResolved`, `actualMerchant`, `reason`을 보존하게 한다.
- WebView flush가 네이버페이 충전 pair를 찾으면 `buildNaverPayDuplicateMergePatch()`로 기존 충전 거래를 실제 결제 정보로 갱신한다.
- verify 스크립트에 native parser contract 검증을 추가한다.

하지 않을 것:
- 삭제된 backend raw ingest/API route를 되살리지 않는다.
- Gemini/API secret을 browser/native 코드에 넣지 않는다.
- 전체 알림 분류 체계를 확장하지 않는다.
- unrelated dirty worktree를 정리하거나 되돌리지 않는다.

검증:
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 가능하면 `npm.cmd run apk:build`
- 운영 배포는 unrelated dirty worktree 때문에 안전하게 커밋/푸시할 수 없으면 차단으로 기록한다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-03-naverpay-android-notification-normalize.md`의 실행 슬라이스 1만 구현하라. Android local notification parser가 요청 샘플을 네이버페이 rail 결제로 정규화하게 만들고, WebView 저장 payload가 rail 필드를 보존하는지 검증하라.
