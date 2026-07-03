# 문자-Gmail 영수증 거래 병합 계획

## 요청 원문

문자자동수집은 잘 구현되었는데, 동일한 카드로 결제한 건에 대해 (1)문자메시지를 수령하고, (2)g-mail로 세부품목이 담겨져있는 메일이 왔을 경우 거래상세 메모나 원문에 이것을 합쳐서 하나로 관리해주게끔 했으면 좋겠음

## 이해한 내용

- 목표: Android 문자/알림 수집으로 먼저 생성된 카드 거래에, 나중에 Gmail 영수증 세부품목이 들어오면 새 거래를 만들지 않고 같은 거래 문서에 연결한다.
- 비목표: raw message 삭제, Gmail 원문 전문을 거래 `body`에 그대로 덧붙이기, 브라우저 코드에 Gmail/Gemini secret 추가, 기존 Android 수집 구조 재작성.
- 사용자 흐름: 카드 결제 문자 수신 -> Android 수집 flush로 거래 생성 -> Gmail receipt sync가 메일을 파싱 -> 같은 금액/날짜/시간의 기존 거래를 찾아 `receiptIds`, `receiptItemSummary`, `memo`를 갱신 -> 거래 상세에서 영수증 품목과 문자 원문을 함께 본다.
- 데이터 가정: SMS 원문은 거래 `body`에 남고, Gmail 세부품목은 `receipts` 문서와 거래의 `receiptIds`/`memo`/`receiptItemSummary`로 연결한다.
- 열려 있는 질문: 사용자가 이메일 전문 전체 저장을 강하게 원하면 별도 보존 정책이 필요하다. 기본안은 품목/요약만 거래에 붙이고 원본 이메일 전문은 저장하지 않는다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: Gmail 세부품목을 거래 `body` 원문에 합칠 것인가, 기존 `receipts` 링크와 `memo`/`receiptItemSummary`에 합칠 것인가?
- 추천 답변: `body`에는 문자 원문을 보존하고, Gmail 품목은 `receipts` 문서와 거래 `receiptIds`에 연결하며 사람이 바로 보는 요약은 `memo`/`receiptItemSummary`에 병합한다.
- 사용자 답변: 별도 질문하지 않음. 코드베이스에 이미 연결 영수증 UI와 memo merge 경로가 있어 추천안을 기본 결정으로 채택한다.
- 확정된 결정: 하나의 `transactions` 문서를 기준으로 관리한다. 기존 SMS 거래를 우선 보존하고 Gmail receipt가 들어오면 링크/요약을 추가한다.
- 남은 가정: 카드 결제 문자와 Gmail 영수증의 금액은 동일하고, 발생일은 같은 KST 날짜다. 시간은 메일 지연 때문에 다소 어긋날 수 있다.

## 결정 기록

- 결정: Gmail receipt pipeline의 `processReceipt()`/matching/enrichment를 보강해 Android SMS 거래와 itemized Gmail receipt를 병합한다.
- 이유: 현재 `api/_lib/receipt-enricher.js`는 이미 `receiptIds`와 `memo` 병합을 담당하므로, 새 저장소나 브라우저 secret 없이 서버 데이터 경계 안에서 해결할 수 있다.
- 되돌릴 수 있는가: 예. 병합 기준과 memo merge helper를 이전 로직으로 되돌리면 된다. 생성된 `receiptIds`/memo는 사용자 데이터이므로 삭제하지 않고 필요 시 후속 보정 스크립트로 상태만 조정한다.

## 실행 슬라이스

### 슬라이스 1: Gmail receipt -> 기존 문자 거래 병합

- 목표: 문자/알림 수집으로 이미 저장된 카드 거래가 있으면 Gmail 영수증이 같은 거래에 붙고, 품목 요약이 메모와 연결 영수증으로 보인다.
- 범위:
  - `api/_lib/receipt-enricher.js`에서 match patch에 `receiptIds`와 단일 호환 필드 `receiptId`를 일관되게 남긴다.
  - 정확한 시간 `±30분` match는 유지하고, itemized receipt가 Android SMS/notification 거래와 같은 금액/같은 KST 날짜일 때 안전한 fallback match를 추가한다.
  - `mergeReceiptMemo()`가 기존 `Android 문자 자동 수집` 메모를 보존하면서 새 영수증 품목 섹션을 덧붙이고, 단순히 `[쿠팡 영수증]`이 있다는 이유로 새 상세품목 갱신을 막지 않게 한다.
  - duplicate receipt가 나중에 품목을 얻는 경우에도 연결 거래의 `memo`/`receiptItemSummary`가 갱신되게 한다.
- 예상 수정 파일:
  - `api/_lib/receipt-enricher.js`
  - `scripts/verify-project.mjs`
  - 필요 시 `api/_lib/receipt-parser.js` fixture 보강
  - `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - Android native 수집 코드
  - 브라우저 UI 레이아웃/CSS
  - Firestore production 데이터 직접 보정
  - Gmail/Gemini secret 처리
  - raw message 삭제
- 구현 메모:
  - match fallback은 `amount` 동일, KST 동일 날짜, hidden 아님, source가 `android_local_sms` 또는 `android_local_notification`인 거래를 우선한다.
  - 후보가 여러 개면 시간 차이, party 유사도, 기존 `receiptIds` 유무로 점수화해 하나만 고른다. 애매하면 새 거래를 만들지 말고 기존 exact match 로직 결과가 없을 때는 생성 경로를 유지한다.
  - 거래 `body`는 SMS 원문으로 남기고 Gmail 품목은 `receiptItemSummary`/`memo`/linked receipt로 표현한다.
- 검증 방법:
  - fixture: `android_local_sms` 거래 `141,000원` + 같은 KST 날짜 Gmail receipt items가 1건의 거래로 병합되는지 확인한다.
  - fixture: 기존 `memo: "Android 문자 자동 수집"` 뒤에 `[가맹점 영수증]` 품목 요약이 추가되는지 확인한다.
  - fixture: 같은 receipt를 두 번 처리해도 memo가 중복 추가되지 않는지 확인한다.
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - production 배포 가능 시 `main` push 후 `Deploy GitHub Pages` workflow 성공과 운영 URL `https://aretenald2018-sys.github.io/budget/` 확인.
- 완료 증거:
  - 검증 fixture가 하나의 transaction id에 `receiptIds`, `receiptId`, `receiptItemSummary`, 병합 memo를 남긴다.
  - 거래 상세에서 연결 영수증 품목과 기존 원문이 같은 거래 안에 표시되는 흐름이 설명 가능하다.
  - `npm.cmd run verify`와 `npm.cmd run pages:build` 결과를 실행 문서에 기록한다.
- 다음 세션 시작 프롬프트:
  - `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`의 슬라이스 1만 실행한다. Gmail receipt가 기존 Android SMS/notification 거래에 안전하게 붙도록 `api/_lib/receipt-enricher.js`와 검증 fixture를 보강하고, Android native 수집 코드와 UI 레이아웃은 변경하지 않는다.

### 슬라이스 2: 이메일 먼저 도착한 경우의 Android 중복 메타데이터 보존

- 목표: Gmail receipt 거래가 먼저 생성되고 이후 Android SMS/notification capture가 duplicate로 들어와도 문자 원문/캡처 메타데이터가 완전히 버려지지 않게 한다.
- 범위:
  - `utils/android-flush.js`의 duplicate branch에서 네이버페이 전용 merge뿐 아니라 일반 Android capture metadata 보존 patch를 적용한다.
  - 기존 receipt 거래의 `memo`와 `receiptIds`를 유지하면서 `body`, `androidCaptureId`, `rawNotification`, source metadata를 보강한다.
- 예상 수정 파일:
  - `utils/android-flush.js`
  - `utils/android-capture.js` 또는 새 helper
  - `scripts/verify-project.mjs`
  - `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge-slice2.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 슬라이스 1에서 다룬 Gmail parser/matcher 재설계
  - UI redesign
  - production 데이터 백필
- 구현 메모:
  - 이 슬라이스는 사용자가 말한 순서의 핵심 경로는 아니지만, "하나로 관리"를 양방향 도착 순서에 대해 완성한다.
- 검증 방법:
  - Gmail-created transaction + later Android SMS duplicate fixture에서 새 transaction이 생성되지 않고 기존 transaction에 SMS `body`가 보존되는지 확인한다.
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
- 완료 증거:
  - Android duplicate ack가 `merged` 또는 동등 상태로 기록되고 기존 receipt transaction에 SMS metadata가 남는다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트, 오래된 캐시/서비스워커 이슈, UX 깨짐을 우선 리뷰한다. 특히 잘못된 same-day match로 서로 다른 같은 금액 결제가 합쳐질 위험, memo 중복 추가, 기존 쿠팡/네이버페이 receipt 경로 회귀, `receiptIds`/`receiptId` 호환성, production 검증 차단 사유를 확인한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 계획 완료, 앱 코드 미수정.
- 실행/리뷰 상태: 슬라이스 1 구현/검증/리뷰/production 배포 완료.
- 실행 문서: `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-sms-gmail-receipt-merge-review.md`
- 현재 자동 상태: `complete`
- 다음 액션: 없음.
- 차단 질문: 없음.
- 운영 증거: GitHub `Validate` run `28645511128` 성공, GitHub `Deploy GitHub Pages` run `28645511079` 성공, production URL HTTP 200.
