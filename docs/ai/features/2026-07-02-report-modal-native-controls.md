# 리포트 카테고리 모달 기본 컨트롤 제거 계획

## 요청

- 사용자 스크린샷의 파란색 표시 영역처럼 거래 행과 `환급처리`가 기본 버튼/체크박스로 보이는 문제를 고친다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-02-report-modal-native-controls.md`
- 원인은 `reportTxRow()`가 native `button`과 checkbox를 직접 렌더하는 구조다.

## 실행 슬라이스 1 - 모달 거래 행 native control 제거

### 목표

- 거래 행은 기본 버튼 테두리가 생길 수 없는 `div role="button"` 구조로 렌더된다.
- `환급처리`는 실제 checkbox 없이 `span role="button"` pill로 렌더된다.
- 클릭/키보드 Enter/Space로 거래 상세 열기와 환급 토글이 동작한다.
- `render-report.js`, `app.js`, `style.css`, `index.html` cache-busting query를 갱신한다.

### 변경 파일

- `render-report.js`
- `styles/20-records.css`
- `style.css`
- `app.js`
- `index.html`
- `docs/ai/NEXT_ACTION.md`

### 범위 제외

- 거래 데이터/집계 로직 변경
- 거래 상세 모달 수정
- 환급 상태 저장 schema 변경

## 검증 계획

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 운영 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 카테고리 모달 하단 거래 행 확인
- 증명 기준:
  - 거래 행에 기본 버튼 테두리가 없다.
  - `환급처리`에 기본 checkbox가 없다.
  - 환급 pill 클릭 시 `환급예정` 상태로 바뀌고 재렌더된다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-02-report-modal-native-controls.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-report-modal-native-controls-review.md`
- `reportTxRow()`의 native `button`/checkbox를 제거했다.
- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- `_site` 산출물 문자열 확인 통과.
- not verified yet: 운영 배포와 운영 UI 클릭 검증은 현재 unrelated dirty/untracked worktree 때문에 수행하지 않았다.
