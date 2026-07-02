# 보상 적립 배분율 직접 입력 전환 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-reward-allocation-direct-input.md`
- 실행: `docs/ai/executions/2026-07-02-reward-allocation-direct-input.md`
- 주요 변경 파일:
  - `render-settings.js`
  - `styles/60-urge.css`
  - `style.css`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈 없음.
- 저장 name인 `allocationRatePct`는 유지되어 기존 `readRewardSettingsForm()` 저장 경로와 호환된다.
- `normalizeRewardSettings()`가 최종 `allocationRate`를 `0.05~1` 사이로 보정하므로, 직접 입력값도 기존 방어 로직을 탄다.
- 슬라이더 전용 CSS는 제거되어 더 이상 range track/thumb 스타일이 남지 않는다.

## 검증 확인

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 산출물에서 새 cache bust, 숫자 입력 마크업, 슬라이더 제거 확인.

## 남은 리스크

- 발견된 차단 이슈 없음.
- 운영 확인 완료:
  - GitHub Pages workflow `28591356877` 성공.
  - 운영 URL에서 새 `app.js`/`style.css` cache bust 로드 확인.
  - 설정 화면에서 `allocationRatePct`가 `type="number"`로 렌더링되고 `input type="range"`가 없는 것 확인.
  - 직접 입력은 저장 없이 `12` 입력 후 `10` 복구로 확인했다.
- 잔여 리스크: 실제 저장 버튼 클릭은 사용자 설정값을 바꾸는 동작이라 수행하지 않았다. 저장 경로는 기존 `allocationRatePct` name을 유지해 기존 로직을 그대로 탄다.
