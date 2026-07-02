# 낡은 끌림 알림 제거 및 설정/리포트 CSS 정리 리뷰

## 리뷰 결과

- 큰 결함 없음.

## 확인한 점

- 낡은 알림 제거는 데이터 삭제 없이 실행 경로만 제거했다.
- `2주 뒤 다시 보기` 기록 자체는 유지되지만 브라우저 알림/toast 예약은 더 이상 하지 않는다.
- 설정 보상 적립 폼은 기존 설정 화면 안에서만 스코프되는 `#tab-settings` CSS로 정리했다.
- 리포트 거래 행 CSS는 `report-category-modal`에서 쓰이는 행 클래스에만 적용했다.
- cache bust가 HTML, CSS entrypoint, 변경된 JS import 경로에 반영됐다.

## 검증

- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- `_site` 산출물에서 낡은 알림 예약 문자열 미검출.

## 운영 확인

- GitHub Pages workflow `28585780537` 성공.
- 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 새 cache bust `20260702-stale-reminder-settings-css` 로드 확인.
- 운영 HTTP 확인: `/budget/`, `styles/20-records.css`, `styles/60-urge.css` 모두 `200`.
- 운영 설정 화면에서 `보상 적립` 토글/select/input/range가 앱 스타일로 렌더링되는 것을 확인했다.
- 운영 CSS에서 리포트 거래 행 스타일 `report-tx-row`, `report-refund-check` 반영을 확인했다.

## 잔여 리스크

- 이 브라우저 세션에서 홈 카테고리 모달 거래 목록이 `0건`으로 열리고 리포트 탭은 spinner 상태에 머물러, 실제 쿠팡 쿠페이 populated row의 운영 시각 확인은 완료하지 못했다.
