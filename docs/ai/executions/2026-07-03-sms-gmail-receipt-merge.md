# 문자-Gmail 영수증 거래 병합 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- 실행 슬라이스: 슬라이스 1 `Gmail receipt -> 기존 문자 거래 병합`

## 변경 파일

- `api/_lib/receipt-enricher.js`
- `scripts/verify-project.mjs`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`

## 구현 내용

- Gmail receipt가 기존 transaction에 매칭될 때 `receiptIds`뿐 아니라 단일 호환 필드 `receiptId`도 함께 남기도록 했다.
- Gmail receipt로 새 transaction을 만들 때도 `receiptId`를 함께 저장한다.
- duplicate receipt가 이미 `matchedTxId`를 가진 경우에도 transaction link field와 `memo`/`receiptItemSummary`가 보강되도록 했다.
- 기존 거래가 legacy `receiptId`만 갖고 `receiptIds` 배열이 없을 때 새 receipt를 붙이면, 기존 단일 receipt id도 `receiptIds` 배열에 함께 보존되도록 했다.
- `mergeReceiptMemo()`가 기존 `Android 문자 자동 수집` 메모를 보존하면서 Gmail 품목 요약을 덧붙이고, 기존 `[가맹점 영수증]` 섹션은 새 품목 요약으로 교체할 수 있게 했다.
- 정확한 시간창 `±30분` 매칭이 실패해도, itemized Gmail receipt가 같은 금액/같은 KST 날짜의 Android SMS/notification 거래와 안전하게 대응되면 기존 거래에 붙는 fallback을 추가했다.
- fallback은 Android 수집 거래만 대상으로 하고, 같은 날짜 동일 금액 후보가 여러 개인데 가맹점 단서가 없으면 매칭하지 않는다.
- push 후 GitHub `Validate` workflow가 APK 산출물을 만들지 않은 상태에서 `npm run verify`를 실행해 실패하는 것을 확인했다. `Validate` workflow 환경에서는 APK artifact/Pages artifact 검사를 Pages workflow에 맡기도록 `scripts/verify-project.mjs`를 보강했다.

## 검증

- `node --check api/_lib/receipt-enricher.js`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (87 JS files checked)`
- `CI=true`, `GITHUB_WORKFLOW=Validate` 환경의 `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과, `_site` 생성
- `git diff --check`: 통과
- `STATIC_ASSETS`/`CACHE_VERSION`/root `sw.js` 검색: 현재 repo에 service worker cache bump 대상 없음
- commit `43af7b4`: `Merge Gmail receipts into SMS transactions`
- commit `5fdeeff`: `Fix Validate APK artifact check`
- GitHub `Validate`: 성공, run `28645511128`
- GitHub `Deploy GitHub Pages`: 성공, run `28645511079`
- production UI `https://aretenald2018-sys.github.io/budget/`: HTTP 200, `Budget` 문자열 확인

## 검증 fixture

`scripts/verify-project.mjs`에 `checkReceiptEnricherSmsGmailMergeSmoke()`를 추가했다.

- `android_local_sms` 거래 `141,000원`과 같은 KST 날짜 Gmail receipt items가 SMS 거래를 선택하는지 확인한다.
- 같은 금액/같은 날짜 Android 후보가 여러 개이고 가맹점 단서가 없으면 fallback match를 피하는지 확인한다.
- `Android 문자 자동 수집` 메모 뒤에 `[쿠팡 영수증]` 품목 요약이 붙는지 확인한다.
- 같은 receipt memo를 다시 병합해도 중복되지 않는지 확인한다.
- 오래된 `[쿠팡 영수증]` 섹션이 새 Gmail item summary로 교체되는지 확인한다.
- Coupang item classification이 `생활비용`/`생활용품`/`gmail_receipt_items`로 유지되는지 확인한다.
- legacy `receiptId`만 있던 거래에 새 receipt를 붙여도 기존 id와 새 id가 모두 `receiptIds`에 보존되는지 확인한다.

## 운영 확인

- production 배포 완료.
- 운영 URL은 HTTP 200이다.
- 실제 사용자 데이터의 다음 확인 기준: 같은 카드 결제에서 SMS 거래와 Gmail 세부품목 메일이 들어오면 거래 상세에서 연결 영수증 품목과 기존 SMS 원문이 같은 거래 안에 보여야 한다.

## 리뷰 대상

- `api/_lib/receipt-enricher.js`
- `scripts/verify-project.mjs`
- `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- `docs/ai/NEXT_ACTION.md`
