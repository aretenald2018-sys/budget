# 문자-Gmail 영수증 거래 병합 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- 실행 문서: `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- 변경 파일:
  - `api/_lib/receipt-enricher.js`
  - `scripts/verify-project.mjs`
  - `docs/ai/NEXT_ACTION.md`

## 발견 사항

- Blocking finding: 없음.
- 리뷰 중 발견 후 수정: legacy 거래에 `receiptId`만 있고 `receiptIds` 배열이 없는 상태에서 새 Gmail receipt가 붙으면, 거래 상세 모달이 `receiptIds` 배열을 우선 읽어 기존 단일 receipt를 놓칠 수 있었다. `receiptLinkIds()`를 추가해 기존 `receiptId`와 새 receipt id를 모두 `receiptIds`에 보존하도록 고쳤고 verifier fixture를 추가했다.
- push 후 발견 후 수정: GitHub `Validate` workflow는 APK를 빌드하지 않는데 `npm run verify`가 APK/Pages artifact까지 요구해 실패했다. `Validate` workflow 환경에서는 해당 artifact 검사를 생략하고, 실제 Pages workflow의 APK build + verify + pages build가 이 검사를 담당하도록 분리했다.

## 확인한 동작

- Gmail receipt가 기존 Android SMS/notification 거래와 같은 금액/같은 KST 날짜이고 itemized receipt라면 fallback match 대상이 된다.
- fallback은 Android 수집 거래만 대상으로 하며, 같은 날짜 동일 금액 Android 후보가 여러 개이고 가맹점 단서가 없으면 매칭하지 않는다.
- `Android 문자 자동 수집` 메모는 보존되고 Gmail 영수증 품목 요약은 별도 섹션으로 추가된다.
- 동일 receipt memo 재처리는 중복 추가되지 않는다.
- 기존 `[쿠팡 영수증]` 섹션은 새 Gmail item summary로 교체된다.
- `receiptIds`/`receiptId` 호환성이 유지되고 legacy `receiptId` 단독 링크도 배열로 보존된다.

## 검증

- `node --check api/_lib/receipt-enricher.js`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (87 JS files checked)`
- `CI=true`, `GITHUB_WORKFLOW=Validate` 환경의 `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `git diff --check`: 통과
- service worker cache bump: repo root에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 없어 대상 없음
- GitHub `Validate`: 성공, run `28645511128`
- GitHub `Deploy GitHub Pages`: 성공, run `28645511079`
- production UI: `https://aretenald2018-sys.github.io/budget/` HTTP 200

## 남은 위험

- 실제 사용자 데이터로 Gmail receipt가 들어오는 순간의 E2E 화면은 아직 별도 fixture 데이터로만 검증했다.
- 운영에서 증명될 UI 상태: 같은 카드 결제의 SMS 거래에 Gmail receipt가 붙은 뒤, 거래 상세에서 연결 영수증 품목과 SMS 원문이 같은 거래 안에 보인다.
