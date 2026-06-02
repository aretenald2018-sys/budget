# 쿠팡 Gmail 영수증 미등록 진단

## 증상

- 사용자 설명: 쿠팡 관련 결제내역 이메일이 자꾸 가계부 거래로 저장되지 않는다.
- 관찰된 실패: `쿠팡 / 주문이 완료되었습니다 / 결제금액 20,420원` 형식과 `쿠팡 / 결제 정보 / 결제금액 20,420원` 형식이 deterministic parser를 통과하지 못하고 Gemini 호출 경로로 떨어진다.
- 영향 범위: `api/gmail-poll.js`로 수집되는 Gmail 영수증 중 쿠팡 발신자/문구 변형, `api/_lib/receipt-parser.js`의 쿠팡 주문 완료 메일 파싱.

## 재현/피드백 루프

- 선택한 루프: `parseReceiptEmail()` 직접 호출 스모크.
- 실행 방법: 쿠팡 이메일 샘플 3종을 `node --input-type=module -e`로 파싱한다.
- 기대 실패: 현재 직접 구매 상세내역 메일만 파싱되고, `결제금액`만 있는 주문 완료/결제 정보 메일은 Gemini API 환경변수가 없으면 실패한다.
- 실제 결과:
  - `구매 상세내역 + 총 결제금액`: `source: "coupang"`, `amount: 20420`, `skip: false`.
  - `주문이 완료되었습니다 + 결제금액`: `GEMINI_API_KEY env 미설정`.
  - `결제 정보 + 결제금액`: `GEMINI_API_KEY env 미설정`.
- 반복 가능성: 높음. 운영에서도 Gemini 실패, 쿼터, 프롬프트 오판이 있으면 같은 형식이 저장되지 않는다.

## 가설

1. 가설: 쿠팡 발신자 변형이 Gmail 검색 쿼리에서 빠진다.
   - 예측: `no-reply@e.coupang.com` 같은 하이픈 발신자가 기존 `noreply@e.coupang.com` 목록과 다르면 sender query로 잡히지 않는다.
   - 검증 방법: `SENDERS`와 `buildGmailQuery()` 확인.
   - 결과: 기존 목록은 `noreply@...`만 포함한다. 발신자 변형 보강이 필요하다.
2. 가설: Gmail 키워드가 실제 쿠팡 주문 메일 표현을 일부 놓친다.
   - 예측: `구매하신 내역`, `주문이 완료되었습니다`, `주문 완료` 형식은 검색 쿼리의 키워드 OR에 충분히 반영되지 않는다.
   - 검증 방법: `buildGmailQuery()` 확인.
   - 결과: `주문하신 내역`, `구매내역`은 있으나 `구매하신 내역`, `주문 완료`, `주문이 완료되었습니다`는 없다.
3. 가설: 쿠팡 parser가 `결제금액`만 있는 직접 주문 메일을 deterministic 처리하지 못한다.
   - 예측: `parseReceiptEmail()`이 Gemini 호출로 떨어진다.
   - 검증 방법: 로컬 스모크 샘플 실행.
   - 결과: 재현됨. 이 경로가 1차 코드 원인이다.

## 수정

- 원인: Gmail 수집 쿼리와 쿠팡 deterministic parser가 실제 쿠팡 주문/결제 메일의 발신자·문구 변형을 너무 좁게 인식한다.
- 변경 파일:
  - `api/gmail-poll.js`
  - `api/_lib/receipt-parser.js`
  - `docs/ai/features/2026-06-02-coupang-gmail-receipt-ingest.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정 내용:
  - 쿠팡 sender 변형과 주문 완료/구매하신 내역 키워드를 Gmail 검색에 추가한다.
  - 쿠팡 parser가 `결제금액`만 있는 직접 주문/결제 정보 메일도 `source: "coupang"` 거래로 파싱하게 한다.
- 회귀 검증:
  - 수정 전 실패한 쿠팡 샘플이 Gemini 없이 파싱되는지 확인한다.
  - 기존 `구매 상세내역 + 총 결제금액` 샘플이 계속 파싱되는지 확인한다.
  - `node --check` 및 `npm.cmd run verify`를 실행한다.
- 제거한 임시 계측: 없음.

## 다음 세션

- 실행할 슬라이스: `docs/ai/features/2026-06-02-coupang-gmail-receipt-ingest.md`의 슬라이스 1.
- 시작 프롬프트: 쿠팡 Gmail 영수증 미등록 보정 슬라이스 1을 실행한다.

## NEXT_ACTION.md 업데이트

- 진단 종료 상태: 원인 재현 완료, 수정 계획 생성.
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 쿠팡 Gmail 영수증 수집/파싱 보강 슬라이스 1을 실행한다.
- 차단 사유: 없음.
