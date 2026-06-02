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
- URL 또는 사용자 흐름:
  - 운영에서는 GitHub Actions `Budget Backend Jobs`를 `mode=sync`, `since=YYYY-MM-DD`, `max=40`으로 수동 실행한다.
  - 앱 URL: `https://aretenald2018-sys.github.io/budget/`
- 기대 증거:
  - Actions sync 결과의 `gmail.created` 또는 `gmail.enriched`가 증가하거나 해당 쿠팡 이메일 결과가 `created`/`enriched`로 남는다.
  - 앱 거래 목록에 쿠팡 결제금액 거래가 보인다.
- 실제 결과:
  - 로컬 parser/문법/프로젝트 검증은 통과.
  - 운영 Gmail/Firestore end-to-end는 Secret과 실제 계정 접근이 필요한 검증이라 not verified yet.

## 결정

- 통과: 예.
- 수정 필요: 없음.
- 후속 계획 필요: 없음. 단, 운영 sync 실행 후 여전히 누락되면 실제 이메일 원문/발신자 기준으로 추가 진단한다.

## NEXT_ACTION.md 업데이트

- 리뷰 종료 상태: 통과.
- 다음 자동 상태: `complete`
- 다음 액션: 배포 후 `Budget Backend Jobs` sync를 실행해 실제 쿠팡 메일이 거래로 생성/보강되는지 확인한다.
- 차단 사유: 없음.
