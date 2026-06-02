# 쿠팡 Gmail 영수증 미등록 보정 리뷰

## 리뷰 대상

- 계획 문서: `docs/ai/features/2026-06-02-coupang-gmail-receipt-ingest.md`
- 진단 문서: `docs/ai/diagnoses/2026-06-02-coupang-gmail-receipt-ingest.md`
- 슬라이스: 슬라이스 1 - 쿠팡 Gmail 수집/파싱 보강
- 변경 파일: `api/gmail-poll.js`, `api/_lib/receipt-parser.js`, `docs/ai/NEXT_ACTION.md`, 계획/진단 문서

## 발견 사항

차단 이슈 없음.

## 확인한 동작

- Gmail 검색 쿼리가 쿠팡 발신자 변형 `no-reply@...`, `order@...`와 주문 완료/구매하신 내역/쿠페이 키워드를 포함한다.
- 쿠팡 직접 주문 메일이 `결제금액`만 포함해도 Gemini 호출 없이 `source: "coupang"` 거래로 파싱된다.
- 구매 상세 표가 없는 메일은 상품명이 있으면 1개 품목으로 보존하고, 상품명이 없으면 `결제금액` 라벨을 품목으로 오인하지 않는다.
- 기존 `구매 상세내역 + 총 결제금액` 쿠팡 메일 파싱은 유지된다.

## 검증

- 명령:
  - 쿠팡 receipt parser 스모크 4종
  - `node --check api/gmail-poll.js`
  - `node --check api/_lib/receipt-parser.js`
  - `npm.cmd run verify`
  - `git diff --check`
- 배포:
  - commit `f4b3874`를 `main`에 push했다.
  - Validate run `26805865590` 성공.
  - Deploy GitHub Pages run `26805865550` 성공.
- URL 또는 사용자 흐름:
  - 운영에서는 GitHub Actions `Budget Backend Jobs`를 `mode=sync`, `since=YYYY-MM-DD`, `max=40`으로 수동 실행한다.
  - 앱 URL: `https://aretenald2018-sys.github.io/budget/`
- 기대 증거:
  - Actions sync 결과의 `gmail.created` 또는 `gmail.enriched`가 증가하거나 해당 쿠팡 이메일 결과가 `created`/`enriched`로 남는다.
  - 앱 거래 목록에 쿠팡 결제금액 거래가 보인다.
- 실제 결과:
  - 로컬 parser/문법/프로젝트 검증은 통과.
  - 운영 sync run `26805872457`은 `since=2026-05-01`, `max=500`으로 실행했으나 `gmail.error: "Bad Request"`로 실패했다.
  - 로컬 `.env.local`의 `GMAIL_*`로도 Gmail token exchange가 `Bad Request`이고, `GOOGLE_*` fallback 값은 비어 있어 과거 이메일 재반영은 not verified yet.

## 결정

- 통과: 예.
- 수정 필요: 없음.
- 후속 계획 필요: Gmail OAuth refresh token 갱신이 필요하다. 새 token으로 `npm.cmd run github:secrets` 후 `Budget Backend Jobs` sync를 다시 실행한다.

## NEXT_ACTION.md 업데이트

- 리뷰 종료 상태: 통과.
- 다음 자동 상태: `needs_user_decision`
- 다음 액션: Google Gmail OAuth 동의를 다시 완료해 새 refresh token을 발급하고, GitHub Secrets 갱신 후 `Budget Backend Jobs` sync를 재실행한다.
- 차단 사유: 현재 `GMAIL_REFRESH_TOKEN`이 Google token endpoint에서 `Bad Request`로 거절된다.
