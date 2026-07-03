# 하나Pay 결제 알림 parser 보강 리뷰

## 리뷰 결과

- parser는 네이버페이 특수 처리 뒤, 일반 카드 승인 parser 앞에 배치되어 기존 네이버페이 처리와 충돌하지 않는다.
- 새 정규식은 `신용/체크/일시불/할부` 결제수단 토막과 `MM.DD HH:mm`을 요구하므로 단순 광고 문구를 결제로 오인할 가능성을 낮췄다.
- 금액 없는 알림은 기존 `parsedRawSkipReason()` guard로 거래 저장되지 않는다.
- Firestore read quota가 소진되어도 deterministic raw는 `accounts/categories` read 없이 파싱될 수 있다.
- duplicate lookup quota fallback은 `duplicateCheckSkipped=true`, `ingestWarnings`와 `needsReview=true`를 남기므로 중복 위험이 숨겨지지 않는다.
- pending dedupe 재시도는 기존 rawId를 재사용하므로 수동 재시도 때 raw가 불필요하게 늘어나는 것을 줄인다.
- dedupe read quota write-only 복구는 `manual_recovery`이면서 deterministic parser가 성공하는 payload에만 제한되어 일반 자동 수집 중복 위험을 넓히지 않는다.

## 잔여 리스크

- MacroDroid가 하나Pay 알림을 서버로 보내지 않으면 parser 보강만으로는 자동 등록되지 않는다.
- public APK는 native 수집을 포함하지 않으므로, MacroDroid 설정 또는 private native APK 채널 중 하나가 실제 폰에서 켜져 있어야 한다.

## 검증 상태

- 로컬 parser smoke 통과.
- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- GitHub Pages workflow:
  - `28628687146` parser smoke 포함 배포 성공.
  - `28628907220` deterministic ingest quota fallback 포함 배포 성공.
  - `28628989629` pending raw 재사용 포함 배포 성공.
  - `28629112673` manual write-only recovery 포함 배포 성공.
- 수동 ingest:
  - 최초 stdin JSON run `28628793058`은 raw `YoYqixH6tNibW3sJGEt6`까지 저장됐으나 Firestore read quota로 `pending`.
  - 최종 manual recovery run `28629172856` 성공.
  - 결과: raw `Sv3ncPMs0oFu1OAYaQjQ`, tx `cHq9SfTd4ZVUDogk9Fp6`, `status=parsed`, `duplicateCheckSkipped=true`, `writeOnlyRetry=true`.
- 운영 UI:
  - 홈에서 오늘 소비 `2,200`, 이번 2주 조절비 `269,090원` 확인.
  - 거래 탭에서 `2026-07-03`, `씨유문정엠스테이트점`, `-2,200원`, `미분류 · 리뷰` 확인.
