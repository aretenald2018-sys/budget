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

## 운영 확인

- 커밋: `5b1979e Remove stale urge reminders and fix settings CSS`
- Pages workflow: `Deploy GitHub Pages` run `28585780537` 성공.
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
- 운영 HTTP 확인:
  - `/budget/` 응답 `200`.
  - `style.css?v=20260702-stale-reminder-settings-css` 로드 확인.
  - `app.js?v=20260702-stale-reminder-settings-css` 로드 확인.
  - `styles/20-records.css?v=20260702-stale-reminder-settings-css` 응답 `200`, `report-tx-row`, `report-refund-check` 반영 확인.
  - `styles/60-urge.css?v=20260702-stale-reminder-settings-css` 응답 `200`, `reward-settings-grid`, `toggle-row input[type="checkbox"]` 반영 확인.
- 운영 설정 화면 확인:
  - `보상 적립` row가 흰 카드/16px radius/그림자 스타일로 렌더링됨.
  - 활성화 checkbox가 42x24 스위치 형태로 렌더링됨.
  - `기준 기간` select와 `일 상한` input이 48px 높이, 14px radius, 설정 카드 톤으로 렌더링됨.
  - range input이 custom track/thumb 스타일로 렌더링됨.
- 운영 리포트 확인:
  - 홈 `생활비용` 및 `정신건강` 카테고리 모달을 열었으나 이 브라우저 세션에서는 각각 `0건`으로 렌더링되어 실제 쿠팡 쿠페이 거래 행을 직접 볼 수 없었다.
  - 리포트 탭은 로딩 spinner 상태가 지속되어 populated category modal을 추가 확인하지 못했다.
