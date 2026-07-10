# 설정 입력 밀도 미니멀 재설계 실행

- 계획: `docs/ai/features/2026-07-10-settings-input-density-redesign.md`
- 범위: 설정의 `예산 & 카테고리`, `보상 적립` 입력 흐름만
- 실행 단위: `설정 전용 dense line-field 적용`

## 적용 내용

- `docs/design-system.md`에 settings 전용 dense line-field의 적용 범위, 40px 높이, divider, focus, select 규칙을 문서화했다.
- `styles/60-urge.css`에서 예산 금액·리듬과 보상 text/number/select를 투명 배경·사방 0px·하단 1px·radius 0으로 한정했다. 숫자는 우측 정렬을 유지했다.
- 예산의 `.budget-settings-card`를 직접 감싼 row와 `.reward-settings-row`만 flat surface로 바꾸고, theme·home 관리·정산·Android 수집 row에는 기존 card treatment를 보존했다.
- `appearance:auto`를 settings select에만 적용해 line-field의 밀도는 유지하면서 선택 affordance를 다시 보였다.
- `style.css`와 `index.html`에 `settings=20260710-settings-density` cache-bust를 추가하되 기존 `v` query 계약은 유지했다.
- `.omo/evidence/settings-input-density-20260710/settings-density-check.mjs`에 RED/GREEN, focus/select, unrelated-row regression, CJK/responsive browser QA를 추가했다. 이 harness는 production bundle에 포함되지 않는다.

## 검증

- RED: 변경 전 `node .omo/evidence/settings-input-density-20260710/settings-density-check.mjs red`가 filled rounded field와 nested shadow를 감지해 non-zero로 종료했다.
- GREEN: `after` fixture가 모든 대상 field의 40px·transparent·좌상우 0px·하단 1px·radius 0·no shadow와 unrelated settings row의 기존 card treatment를 확인했다.
- Focus: 첫 budget input은 `active=true`, `borderBottomColor=rgb(99, 102, 241)`, `outlineStyle=solid`, 40px로 확인했고 rhythm select는 `spread` 값으로 선택됐다.
- Responsive: 375×844, 768×844, 1280×844 browser capture에서 Korean label one-line/ellipsis와 overflow 없음이 확인됐다.
- `npm.cmd run verify`: 통과 (`95 JS files checked`).
- `npm.cmd run pages:build`: 통과 (`_site` artifact 생성).
- `git diff --check`: 통과.

## 미검증

- `not verified yet`: production `https://aretenald2018-sys.github.io/budget/`에는 배포하지 않았다.
- 차단 사유: 현재 worktree에 unrelated GPS rewrite 등 사용자 변경이 다수 있고, 사용자에게 commit/push 권한을 명시적으로 받지 않았다. production 데이터 저장은 수행하지 않았다.
