# Gmail 과거 영수증 재처리 차단 진단

## 증상

- 사용자 요청: 쿠팡 이메일 수정 이전에 저장되지 않은 과거 결제내역도 확인해 다시 반영한다.
- 시도 범위: `2026-05-01` 이후 Gmail 영수증, `max=500`.
- 관찰된 실패:
  - 로컬 `.env.local`의 `GMAIL_*` OAuth 세트로 `pollGmailReceipts()` 실행 시 `Bad Request`.
  - GitHub Actions `Budget Backend Jobs` run `26805872457`도 `gmail.error: "Bad Request"`로 실패.
  - `.env.local`에는 `GOOGLE_*` 키가 있으나 값 길이가 0이라 fallback 토큰으로 사용할 수 없다.

## 재현/피드백 루프

- 선택한 루프:
  - 로컬 `pollGmailReceipts({ sinceText: "2026-05-01", max: 500 })`.
  - GitHub Actions `workflow_dispatch` `mode=sync`, `since=2026-05-01`, `max=500`.
- 기대 결과: 수정된 쿠팡 parser로 과거 Gmail을 다시 읽고 누락 영수증을 `created` 또는 `enriched` 처리한다.
- 실제 결과:
  - 로컬 Gmail token exchange: `Bad Request`.
  - Actions run `26805872457`: `gmail.error: "Bad Request"`.
  - 같은 Actions run에서 Firebase/raw 단계는 실행됐으므로 `FIREBASE_SERVICE_ACCOUNT` 자체 차단은 아니다.
- 반복 가능성: 높음. Gmail refresh token이 무효화되었거나 OAuth client와 맞지 않는 상태라 토큰 갱신 전에는 같은 실패가 반복된다.

## 가설

1. 가설: `GMAIL_REFRESH_TOKEN`이 만료/취소/다른 client용 토큰이다.
   - 예측: Google token endpoint가 `invalid_grant` 계열을 `Bad Request`로 반환한다.
   - 검증 방법: 로컬과 Actions에서 같은 `Bad Request` 확인.
   - 결과: 지지됨.
2. 가설: GitHub Secrets만 잘못됐고 로컬 `.env.local`은 정상이다.
   - 예측: 로컬은 성공하고 Actions만 실패한다.
   - 결과: 반증됨. 로컬도 실패한다.
3. 가설: 대체 `GOOGLE_*` 토큰으로 우회 가능하다.
   - 예측: `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` 값이 채워져 있다.
   - 결과: 반증됨. 키는 있으나 값 길이가 0이다.

## 수정/조치

- 완료:
  - 쿠팡 Gmail parser 수정분을 commit `f4b3874`로 `main`에 push했다.
  - Validate run `26805865590` 성공.
  - Deploy GitHub Pages run `26805865550` 성공.
  - Actions sync run `26805872457`을 `since=2026-05-01`, `max=500`으로 실행했다.
- 차단:
  - Gmail OAuth token exchange가 `Bad Request`라 과거 Gmail을 조회하지 못했고, 따라서 과거 쿠팡 이메일을 실제 Firestore 거래로 재반영하지 못했다.
- 필요한 다음 조치:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run gmail:auth`
  - Google 동의 완료 후 `.env.local`에 새 `GMAIL_REFRESH_TOKEN` 저장.
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run github:secrets`
  - GitHub Actions `Budget Backend Jobs`를 `mode=sync`, `since=2026-05-01`, `max=500`으로 다시 실행.

## NEXT_ACTION.md 업데이트

- 진단 종료 상태: 코드 배포 완료, 과거 Gmail 재처리는 OAuth 차단.
- 다음 자동 상태: `needs_user_decision`
- 다음 액션: 사용자가 Google Gmail OAuth 동의를 다시 완료해 새 refresh token을 발급한 뒤 secrets를 갱신하고 sync를 재실행한다.
- 차단 사유: 현재 `GMAIL_REFRESH_TOKEN`이 Google token endpoint에서 `Bad Request`로 거절된다.
