# 낡은 끌림 알림 제거 및 설정/리포트 CSS 정리 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-stale-reminder-settings-report-css.md`
- 실행 슬라이스: `낡은 알림 제거 + 설정 보상 적립 CSS + 리포트 거래 행 CSS`
- 실행 일시: 2026-07-02 KST

## 구현

- 낡은 끌림 예약 알림 제거
  - `app.js`에서 로그인 후 `scheduled` urge를 읽어 toast/브라우저 알림을 예약하던 `armUrgeReminders()` 경로를 제거했다.
  - `urge/render-urge-alternatives.js`에서 `2주 뒤 다시 보기` 선택 시 `Notification.requestPermission()`과 `setTimeout`으로 알림을 예약하던 경로를 제거했다.
- 설정 화면 CSS 정리
  - `보상 적립` 활성화 checkbox를 앱 스위치 스타일로 보이게 했다.
  - `기준 기간`, `기준선 방식` select를 `.tds-select`로 맞췄다.
  - 보상 적립 입력/슬라이더/액션 영역을 설정 카드 안에서 깨지지 않도록 정리했다.
- 리포트 카테고리 내역 CSS 정리
  - `report-tx-row`, `report-tx-open`, `report-refund-check` 전용 CSS를 추가했다.
  - 거래 버튼과 `환급처리` pill을 분리해 쿠팡 쿠페이처럼 긴 행에서도 겹치지 않게 했다.
- 캐시 일관성
  - `20260702-stale-reminder-settings-css` query string을 `index.html`, `style.css`, `app.js`, `urge/render-urge-input.js`에 반영했다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 문자열 확인
  - 새 cache bust `20260702-stale-reminder-settings-css` 반영 확인.
  - `report-refund-check`, `report-tx-row`, `reward-settings-grid` 반영 확인.
  - `armUrgeReminders`, `scheduleBrowserNotification`, `끌림 예약 시간이 왔어요`, `다시 볼 시간`, `Notification`, `requestPermission` 미검출.

## 남은 확인

- GitHub Pages 배포 후 운영 URL에서 설정 화면과 리포트 카테고리 내역 모달을 직접 확인한다.
