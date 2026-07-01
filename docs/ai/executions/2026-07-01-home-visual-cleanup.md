# 홈 상단 시각 정리 실행 기록

## 범위

- 계획: `docs/ai/features/2026-07-01-home-visual-cleanup.md`
- 슬라이스: 슬라이스 1 - 홈 첫 화면 시각 회귀 정리

## 변경 요약

- `index.html`에서 가짜 기기 상태 표시용 `.status-bar` 마크업을 제거했다.
- `styles/60-urge.css`에서 홈 hero의 `이번 2주` / `이번 달` 버튼 기본 브라우저 테두리/배경을 제거하고, 선택/비선택 상태가 카드 톤에 맞게 보이도록 정리했다.
- 설정 버튼 크기, 배경, 테두리, 그림자를 토글과 맞췄다.
- 홈 hero 기간/금액 텍스트의 자간을 0으로 맞춰 기존 앱 타이포그래피 흐름과 어긋나지 않게 했다.
- `index.html`과 `style.css`의 CSS cache-busting query를 `20260701-home-visual-cleanup`으로 갱신했다.

## 검증

- `npm.cmd run verify` 통과
- 실제 브라우저 UI 확인은 not verified yet. 프로젝트 규칙상 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/` 홈 첫 화면을 확인해야 한다.

## 리뷰 포인트

- `.status-bar` 제거로 앱 헤더 상단 여백이나 sticky header 위치가 어색해지지 않는지 확인한다.
- 토글 버튼이 `button` 기본 스타일 없이 렌더링되는지 확인한다.
- 설정 버튼 클릭 이벤트는 기존 `data-report-action="open-biweekly-start-settings"` 경로를 그대로 타는지 확인한다.
