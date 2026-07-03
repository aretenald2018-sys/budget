# 쿠팡 파싱 실패 근본 원인 보고

## 결론

쿠팡 결제내역이 가계부에 저장되지 않는 근본 원인은 단일 parser 정규식 문제가 아니라, 쿠팡용 주 경로인 Gmail receipt pipeline의 백필 차단과 기존 이메일 검색/파싱 범위 부족이 겹친 end-to-end ingest 문제다.

우선순위 기준의 원인은 다음과 같다.

1. 쿠팡은 원칙적으로 MacroDroid raw 알림이 아니라 Gmail 영수증 파싱으로 받는 설계다. 따라서 쿠팡 거래가 `raw_messages`에 없다는 사실만으로는 MacroDroid 누락이라고 볼 수 없다.
2. 누락을 보완해야 할 Gmail 영수증 백필 경로가 `GMAIL_REFRESH_TOKEN` 문제로 `Bad Request`를 반환한다.
3. 기존 쿠팡 Gmail deterministic parser와 Gmail 검색 쿼리가 일부 쿠팡 주문/결제 문구 변형을 놓쳤다. 이 항목은 commit `f4b3874`에서 보강됐다.
4. 결제 금액이 없는 쿠팡 취소/배송/반품 알림이 거래 후보로 해석되어 `0원` transaction을 만들 수 있었다. 이 항목은 commit `217b624`에서 신규 저장 방지 처리가 됐다.

## 근거

### 1. 쿠팡은 Gmail receipt pipeline이 주 경로

프로젝트 구조상 MacroDroid는 SMS/앱 알림 JSON을 `raw_messages`로 저장하고, 쿠팡 같은 이메일 영수증은 `api/gmail-poll.js`가 Gmail을 폴링한 뒤 `api/_lib/receipt-parser.js`와 `api/_lib/receipt-enricher.js`를 통해 receipt/transaction으로 반영한다.

따라서 `docs/ai/diagnoses/2026-06-04-toss-june3-discrepancy.md`의 2026-06-03 대조에서 Toss 화면의 쿠팡 쿠페이 결제 `11,460원`, `10,890원`이 당시 `raw_messages`에 없었던 것은 MacroDroid 누락이라기보다 Gmail receipt pipeline이 아직 백필되지 않았다는 신호로 보는 것이 더 정확하다.

`docs/ai/diagnoses/2026-05-31-calendar-ingest-gap.md`의 2026-05-28 쿠팡 구페이 `20,420원`도 raw에는 없었지만, Gmail 백필 성공 후 거래와 receipt item으로 반영될 수 있는 유형이었다.

### 2. Gmail 백필 경로가 OAuth에서 막힘

쿠팡 이메일 parser 수정 후 과거 이메일을 재조회하려 했지만, `docs/ai/diagnoses/2026-06-02-gmail-oauth-replay-blocked.md` 기준으로 로컬과 GitHub Actions 양쪽에서 Gmail token exchange가 `Bad Request`를 반환했다.

추가 확인한 GitHub Actions run `26924862736`도 같은 상태다.

- run URL: `https://github.com/aretenald2018-sys/budget/actions/runs/26924862736`
- 결론: `failure`
- 로그 요약: `gmail.error: "Bad Request"`
- 같은 run의 raw 재처리: `processed: 4`, `parsed: 1`, `skipped: 3`, `failed: 0`

즉 raw pipeline은 일부 동작하지만, Gmail 영수증 수집/백필은 현재 refresh token 재발급 전까지 사용할 수 없다. 이메일 안에 정상 쿠팡 결제 내역이 있어도 이 경로로는 현재 거래 생성이 불가능하다.

### 3. 과거 parser 범위 부족은 수정됨

`docs/ai/diagnoses/2026-06-02-coupang-gmail-receipt-ingest.md`에서 기존 실패 원인을 확인했다.

- Gmail 검색 쿼리가 `no-reply@...`, `order@...` 같은 쿠팡 발신자 변형을 놓쳤다.
- `구매하신 내역`, `주문 완료`, `주문이 완료되었습니다`, `쿠페이` 등 실제 쿠팡 메일 문구가 검색 키워드에 부족했다.
- `결제금액`만 있는 쿠팡 주문 완료/결제 정보 메일이 deterministic parser를 통과하지 못하고 Gemini fallback으로 떨어졌다.

현재 코드는 `api/gmail-poll.js`에 쿠팡 발신자/키워드가 보강되어 있고, `api/_lib/receipt-parser.js`는 `결제금액` 기반 쿠팡 직접 주문 메일도 `source: "coupang"`, `amount > 0` 거래로 처리한다. 이 부분은 코드 원인이 제거된 상태다.

### 4. 금액 없는 쿠팡 알림 오염은 신규 저장 방지됨

`docs/ai/diagnoses/2026-06-04-toss-june3-discrepancy.md`에서 앱 DB에 쿠팡 `amount: 0`, `needsReview: true` 거래가 확인됐다. 원문은 결제 금액 없는 쿠팡 "주문 취소/환불 예정" 알림이었다.

이 문제는 신규 쿠팡 결제가 누락되는 원인은 아니지만, 거래 목록을 오염시켜 "쿠팡은 들어왔는데 금액이 이상하다"는 증상을 만들었다.

commit `217b624` 이후 서버 ingest, pending raw 재처리, 브라우저 fallback 경로는 `parsedRawSkipReason()` 기준으로 `amount <= 0` 거래 타입 결과를 transaction 저장 전에 `skipped` 처리한다. 단, 이미 만들어진 운영 `0원` transaction은 자동 삭제하지 않았다.

## 현재 상태 판정

- 새 쿠팡 Gmail parser는 지원 형식에 대해 동작하도록 보강됐다.
- 금액 없는 쿠팡 취소/배송/반품 알림은 신규 transaction으로 저장되지 않게 보강됐다.
- 하지만 Gmail OAuth가 `Bad Request` 상태이면 앱은 쿠팡 이메일을 읽을 수 없어 과거/신규 쿠팡 거래를 만들 수 없다.
- MacroDroid에 쿠팡 앱 알림을 추가하는 것은 선택적 보조 경로다. 주 경로는 Gmail이며, 쿠팡 배송/반품/취소 알림만 수집하면 오히려 금액 없는 알림이 들어올 수 있다.

## 필요한 조치

1. Gmail OAuth를 재발급한다.
   - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run gmail:auth`
   - Google 동의 완료 후 `.env.local`에 새 `GMAIL_REFRESH_TOKEN`을 저장한다.
   - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run github:secrets`
2. GitHub Actions `Budget Backend Jobs`를 `mode=sync`, `since=2026-05-01`, `max=500`으로 재실행해 과거 쿠팡 이메일을 백필한다.
3. 쿠팡은 Gmail receipt pipeline을 기준으로 운영한다. 정기 sync 또는 수동 sync 후 `gmail.errors: 0`, `created/enriched` 증가, 앱 거래 목록의 쿠팡 금액 반영을 확인한다.
4. MacroDroid에 쿠팡 앱 알림을 추가하는 것은 필수가 아니다. 추가하려면 배송/반품/취소 알림이 아니라 실제 결제 승인 금액이 포함된 알림만 선별해야 한다.
5. 기존 운영 `0원` 쿠팡 transaction은 별도 cleanup 슬라이스에서 확인 후 삭제 또는 skipped raw로만 남긴다.

## 검증한 것과 검증하지 못한 것

검증한 것:

- 2026-06-03 쿠팡 쿠페이 `11,460원`, `10,890원`은 당시 raw와 transactions 양쪽에 없다는 기존 진단을 재확인했다.
- 2026-05-28 쿠팡 구페이 `20,420원`도 당시 raw에 없었다는 기존 진단을 확인했다.
- GitHub Actions run `26924862736`에서 Gmail이 `Bad Request`로 실패하고 raw 재처리는 일부 정상 진행되는 것을 확인했다.
- 현재 코드에 쿠팡 Gmail sender/keyword/parser 보강과 `amount <= 0` skip guard가 들어가 있음을 확인했다.

검증하지 못한 것:

- 새 Gmail refresh token이 없어서 과거 쿠팡 이메일 백필 성공은 아직 not verified yet.
- MacroDroid 쿠팡 알림 수집은 주 경로가 아니므로 필수 검증 대상이 아니다. 단, 별도 보조 경로로 쓰려면 실제 금액 포함 알림 샘플 검증이 필요하다.
