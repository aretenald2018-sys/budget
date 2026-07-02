# 보상 적립 배분율 직접 입력 전환 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-reward-allocation-direct-input.md`
- 실행 슬라이스: 설정 배분율 슬라이더 제거 및 숫자 입력 전환
- 실행 일시: 2026-07-02 KST

## 구현

- `render-settings.js`
  - `적립 배분율` 컨트롤을 `input type="range"`에서 `input type="number"`로 변경했다.
  - 기존 저장 필드명 `allocationRatePct`는 유지했다.
  - `%` suffix를 별도 텍스트로 붙여 단위가 명확하게 보이게 했다.
  - 슬라이더 label 동기화 이벤트를 제거했다.
- `styles/60-urge.css`
  - 슬라이더 전용 track/thumb 스타일을 제거했다.
  - 숫자 입력과 `%` suffix를 한 줄에 배치하는 `.reward-rate-field` 스타일을 추가했다.
- `app.js`, `style.css`, `index.html`
  - 운영에서 새 설정 JS/CSS가 로드되도록 cache bust를 `20260702-reward-rate-input`으로 갱신했다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 확인
  - `app.js?v=20260702-reward-rate-input` 반영 확인.
  - `style.css?v=20260702-reward-rate-input` 반영 확인.
  - `render-settings.js?v=20260702-reward-rate-input` 반영 확인.
  - `styles/60-urge.css?v=20260702-reward-rate-input` 반영 확인.
  - `allocationRatePct`가 `type="number"`로 렌더링되는 것 확인.
  - `reward-range`, `type="range"` 제거 확인.

## 운영 확인

- 커밋: `ca6c98d` Use direct input for reward rate
- Pages workflow: `Deploy GitHub Pages` run `28591356877` 성공.
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
- 운영 확인:
  - `app.js?v=20260702-reward-rate-input`, `style.css?v=20260702-reward-rate-input` 로드 확인.
  - 설정 화면의 `적립 배분율` 필드가 `input type="number"`, name `allocationRatePct`, min `5`, max `100`, step `1`로 표시됨.
  - 보상 적립 폼 안에 `input type="range"` 없음.
  - 저장 없이 직접 입력 가능 여부 확인: 값 `12` 입력 성공 후 기존 값 `10`으로 복구.

## 변경 파일

- `render-settings.js`
- `styles/60-urge.css`
- `style.css`
- `app.js`
- `index.html`
- `docs/ai/features/2026-07-02-reward-allocation-direct-input.md`
- `docs/ai/executions/2026-07-02-reward-allocation-direct-input.md`
- `docs/ai/NEXT_ACTION.md`
