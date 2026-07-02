# 하나Pay 결제 알림 parser 보강 계획

## 목표

하나Pay 알림 `(결제) 금액 가맹점 / 신용(...) / MM.DD HH:mm / 누적이용금액 ...` 형식을 Gemini 없이 `card_payment` 거래로 파싱한다.

## 슬라이스 1

- `api/_lib/server-parser.js`
  - 네이버페이 전용 parser 다음, 일반 `승인/취소` parser 이전에 하나Pay류 결제 알림 parser를 추가한다.
  - 금액, 가맹점, KST 발생시각, 카드 키워드를 추출한다.
- `scripts/verify-project.mjs`
  - 첨부 샘플을 parser smoke test에 추가한다.

## 제외

- MacroDroid 기기 설정 자동 변경은 하지 않는다.
- 운영 raw 삭제나 기존 거래 임의 삭제는 하지 않는다.
- native APK 공개 배포 정책은 변경하지 않는다.

## 검증

- 샘플 parser 재현: `card_payment`, `2200`, `씨유문정엠스테이트점`, `2026-07-03T08:40:00+09:00`.
- `node --check api/_lib/server-parser.js`
- `node --check scripts/verify-project.mjs`
- `npm.cmd run verify`
- 운영 배포 후 `workflow_dispatch mode=ingest`로 누락 건 등록 확인.
