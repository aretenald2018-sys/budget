# 쿠팡 Gmail 영수증 동기화 복구 계획

## 요청 원문

가계부 쿠팡 지메일 통합작업 관련(계속 개편시도했으나 막히는게있어서 코드 수정 완결한 적이 없음), 너가할 수 있는건 다 너가하되 내가 해줘야 하는 부분 지금 알려줘

## 현재 판단

- 적용 트리거: `/diagnose`
- 목표: 쿠팡 Gmail 영수증이 GitHub Actions sync를 통해 `receipts`와 기존 Android 문자/알림 거래에 연결되는 운영 경로를 다시 살린다.
- 기존 차단점: Gmail OAuth refresh token이 더 이상 access token으로 교환되지 않았다.
- 현재 상태: 사용자 재인증 후 OAuth, GitHub Actions sync, Firestore receipt/transaction 연결까지 복구 확인했다.
- 앱 코드 수정 상태: 앱 코드는 수정하지 않았다.

## 확인한 증거

- `.env.local`에는 필요한 키 이름이 있다: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`.
- GitHub CLI는 `aretenald2018-sys` 계정으로 로그인되어 있고 `repo`, `workflow` scope가 있다.
- 최신 Gmail sync job:
  - workflow: `Budget Backend Jobs`
  - run: `28984852204`
  - created: `2026-07-09T00:17:16Z`
  - job: `sync`
  - result: failure
  - output: `gmail.error: "Bad Request"`
- 같은 local `.env.local` 값으로 Google OAuth token endpoint를 직접 확인한 결과:
  - `status=400`
  - `error=invalid_grant`
  - `errorDescription=Bad Request`
  - `hasAccessToken=false`
- 따라서 현재 실패는 Gmail 검색 쿼리, 쿠팡 파서, Firestore 저장, Gemini 파싱 전에 발생한다.

## 반증한 가설

- GitHub Actions secret 이름 누락: 로그에 `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`이 주입된다.
- Firestore admin 초기화 실패: 이번 실패 로그는 Gmail token 교환 단계에서 먼저 실패한다.
- 쿠팡 receipt parser 미구현: `api/_lib/receipt-parser.js`에 쿠팡 deterministic parser가 있고, `api/_lib/receipt-enricher.js`에 SMS/Gmail 병합 fixture가 있다.
- Gmail query syntax 문제: 현재 재현은 query 호출 전 `getAccessToken()`에서 실패한다.

## 사용자가 지금 해야 하는 일

완료됨: 사용자가 `npm.cmd run gmail:auth`를 실행했고 Google OAuth callback 화면에서 `Gmail connected`를 확인했다.

운영 UI 확인까지 Codex가 완료했다. 사용자가 추가로 해야 할 필수 작업은 없다.

## 완료한 복구 작업

1. 새 `.env.local`의 Gmail refresh token으로 OAuth token endpoint smoke test를 실행했다.

```json
{"ok":true,"status":200,"error":null,"hasAccessToken":true,"expiresIn":3599}
```

2. `npm.cmd run github:secrets`로 GitHub Actions secrets를 갱신했다.

```text
set GEMINI_API_KEY
set FIREBASE_SERVICE_ACCOUNT
set USER_UID
set GMAIL_CLIENT_ID
set GMAIL_CLIENT_SECRET
set GMAIL_REFRESH_TOKEN
GitHub Actions secrets synced to aretenald2018-sys/budget.
```

3. `Budget Backend Jobs`를 `mode=sync`, `since=2026-07-09`, `max=20`으로 수동 실행했다.

- run: `29011951413`
- result: success
- Gmail summary:

```json
{
  "ok": true,
  "since": "2026-07-09",
  "gmail": {
    "count": 3,
    "created": 2,
    "enriched": 1,
    "updated": 0,
    "skipped": 0,
    "errors": 0
  }
}
```

4. Firestore에서 쿠팡 receipt 연결 상태를 검증에 필요한 제한 필드로 다시 캡처했다.

- `2026-07-08` 이후 쿠팡 receipt: 3건
- 기존 Android SMS 거래에 enrich된 쿠팡 receipt: 1건
- Gmail 거래로 생성된 쿠팡 receipt: 2건
- 3건 모두 `matchedTxId`, `receiptIds`, `receiptItemSummary`, `[쿠팡 영수증]` memo 연결 확인
- 증거 파일은 OAuth token, service account 값, `emailId`, raw message/body, 계좌 필드를 제외하고 `receiptId`, `matchedTxId`, `transaction.receiptIds`, `receiptItemSummary`, `memo`를 보존해 독립 검증 가능하게 했다.

5. production URL HTTP 확인:

```text
https://aretenald2018-sys.github.io/budget/ -> HTTP 200 OK
```

6. production UI 거래 상세 확인:

- URL: `https://aretenald2018-sys.github.io/budget/`
- 사용자 흐름: `거래 -> 2026-07-09 -> 쿠팡 -4,990원 거래 상세`
- 결과:

```json
{
  "hasTransactionDetail": true,
  "hasCoupangReceiptHeader": true,
  "hasCoupangMerchant": true,
  "hasReceiptAmount4990": true
}
```

- 화면 상태: 거래 상세 modal에 `📄 쿠팡 영수증`, 품목명 `백설 나폴리맛피아 권성준셰프 치폴레 토마토 파스타소스, 600g, 1개`, `4,990원`이 보였다.
- 증거:
  - `.omo/evidence/coupang-gmail-recovery-20260709/firestore-linkage.json`
  - `.omo/evidence/coupang-gmail-recovery-20260709/display-path.txt`
  - `.omo/evidence/coupang-gmail-recovery-20260709/production-coupang-detail.png`
- cleanup: in-app browser tab closed.

## 이전 사용자 액션 기록

1. 프로젝트 루트에서 일반 터미널로 실행:

```powershell
npm.cmd run gmail:auth
```

2. 브라우저가 열리면 쿠팡 영수증 메일을 받는 Google 계정으로 로그인하고 Gmail read-only 권한을 허용한다.
3. 성공하면 `.env.local`의 `GMAIL_REFRESH_TOKEN`이 새 값으로 갱신된다. 이 값은 채팅에 붙여넣지 말고, 갱신됐다고만 알려준다.
4. Google 화면에서 `redirect_uri_mismatch` 또는 `invalid_request`가 뜨면 Google Cloud OAuth client에 아래 redirect URI를 등록한다.

```text
http://127.0.0.1:53682/oauth2callback
```

5. OAuth consent screen이 External/Testing 상태라면 refresh token이 다시 만료될 수 있다. 장기 운영하려면 Google Cloud에서 앱 publishing status를 In production으로 바꾸는 것이 좋다. Google 공식 OAuth 문서도 Testing 상태의 external OAuth app refresh token은 7일 만료될 수 있다고 설명한다.

## Codex가 이어서 할 일

완료된 항목:

- local token 교환 smoke test로 `invalid_grant` 해소 확인
- `npm.cmd run github:secrets`로 GitHub Actions secrets 반영
- `Budget Backend Jobs` sync 수동 실행
- run log에서 `gmail.count=3`, `created=2`, `enriched=1`, `errors=0` 확인
- Firestore에서 쿠팡 receipt와 transaction 연결 확인

남은 항목: 없음.

## 필요 시 실행할 코드 슬라이스

새 token으로 OAuth가 복구된 뒤에도 쿠팡 메일이 누락되면 그때 앱 코드 슬라이스를 실행한다.

- `api/_lib/gmail.js`: OAuth/Gmail API 오류가 `invalid_grant`, query error 등 원인을 숨기지 않도록 에러 메시지를 개선한다.
- `api/gmail-poll.js`: 실제 Gmail 검색 결과가 부족하면 sender/keyword query를 보강한다.
- `api/_lib/receipt-parser.js`: 실제 쿠팡 메일 형식 fixture 기준으로 amount/items 추출을 보강한다.
- `scripts/verify-project.mjs`: 쿠팡 Gmail parser/query 회귀 fixture를 추가한다.

## 검증 기준

- local token smoke test가 `hasAccessToken=true` 또는 동등 성공으로 통과한다. 완료.
- GitHub Actions `Budget Backend Jobs` sync run이 성공한다. 완료.
- run log의 Gmail 요약에 `errors=0`이 나온다. 완료.
- 신규 또는 backfill 쿠팡 영수증이 있으면 `created/enriched/updated` 중 하나가 1 이상이다. 완료.
- Firestore에서 쿠팡 receipt가 `matchedTxId`, `receiptIds`, `receiptItemSummary`, memo에 연결된다. 완료.
- production UI `https://aretenald2018-sys.github.io/budget/`에서 대상 거래 상세에 `[쿠팡 영수증]` 품목 요약이 보인다. 완료.

## 다음 액션

- 상태: `complete`
- 사용자 액션: 없음.
- Codex 액션: 없음.
