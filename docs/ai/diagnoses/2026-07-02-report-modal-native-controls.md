# 리포트 카테고리 모달 기본 컨트롤 노출 진단

## 증상

- 사용자 스크린샷에서 리포트 카테고리 드릴다운 모달 하단 거래 행이 브라우저 기본 `button` 테두리처럼 보인다.
- `환급처리`도 실제 checkbox와 큰 텍스트가 그대로 노출되어 모달 하단부가 깨져 보인다.

## 재현/피드백 루프

- 사용자 제공 스크린샷의 파란색 표시 영역을 실패 기준으로 삼았다.
- `render-report.js`의 `reportTxRow()` 확인 결과, 거래 열기는 `<button class="report-tx-open">`, 환급 처리는 `<label><input type="checkbox">`로 렌더된다.
- CSS가 캐시되거나 늦게 적용되는 상황에서는 native `button`/`checkbox`가 그대로 노출될 수 있다.

## 가설

1. 문제는 CSS 수치가 아니라 native form control이 마크업에 남아 있는 구조다.
2. `app.js`의 `render-report.js` import query가 아직 `20260702-home-gauge-fill`이라, `render-report.js`를 고쳐도 캐시 갱신 없이는 운영 브라우저가 이전 모듈을 볼 수 있다.
3. CSS query도 한 번 더 올리지 않으면 모바일 캐시가 이전 스타일을 계속 볼 수 있다.

## 진단 결론

- `reportTxRow()`에서 기본 `button`과 checkbox를 제거하고 `data-report-action` 기반 `div/span` 컨트롤로 바꾼다.
- `bindReportModal()`에서 거래 상세 열기와 환급 토글을 delegated listener로 처리한다.
- CSS와 JS cache-busting query를 함께 갱신한다.
