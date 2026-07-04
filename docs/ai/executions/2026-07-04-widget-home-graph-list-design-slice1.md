# 위젯/홈 그래프 목록형 디자인 실행 - 슬라이스 1

## 범위

- 계획: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 실행 슬라이스: 슬라이스 1 `홈 그래프 목록형 위젯 primitive`
- 요청 목표: 2번 사진의 초록 팔레트를 복사하지 않고, rounded list widget row 구조를 홈 그래프에 적용한다.
- 제외 범위: Android native launcher widget layout/provider는 이번 실행에서 수정하지 않았다.

## 변경 내용

- `docs/design-system.md`
  - `목록형 위젯 그래프` primitive를 추가했다.
  - row shell, fill, mark, label, value, meta, 340px 이하 반응형 규칙을 문서화했다.
- `render-report.js`
  - `rewardPointBucketRow()`를 홈 widget row anatomy로 변경했다.
  - 포인트 row는 mark, label, 우측 percent value, row fill, 1줄 meta를 사용한다.
  - 홈 `gaugeRow()`는 `homeMode && showIcon === false`일 때 같은 row primitive를 사용한다.
  - 리포트 탭 일반 gauge row는 기존 구조를 유지했다.
- `styles/60-urge.css`
  - `.home-widget-row-shell`, `.home-widget-fill`, `.home-widget-mark`, `.home-widget-name`, `.home-widget-value`, `.home-widget-row-meta`를 추가했다.
  - 홈 변동비 panel의 목록형 row spacing과 340px 이하 축소 규칙을 추가했다.
- `style.css`, `index.html`, `app.js`, `render-home.js`
  - CSS/JS cache-busting query를 `20260704-widget-home-graph-list`로 갱신했다.
- `scripts/verify-project.mjs`
  - canonical app module version을 `20260704-widget-home-graph-list`로 갱신했다.
  - 새 홈 widget row selector, 디자인 문서 token, CSS cache-bust 계약 검사를 추가했다.

## 검증

- `git diff --check`: 통과
- `node --check render-report.js && node --check scripts/verify-project.mjs && node --check app.js && node --check render-home.js`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (87 JS files checked)`
- `npm.cmd run pages:build`: 통과, `_site` artifact 생성 완료
- Playwright visual QA harness:
  - 실제 `render-home.js`, `render-report.js`, 실제 CSS를 사용하고 `data.js`만 deterministic stub으로 대체했다.
  - 모바일 `390x844`에서 `이번 2주`와 `이번 달` 상태를 모두 렌더했다.
  - 결과: 3개 포인트 row, 3개 이상 변동비 row, preview 크기 텍스트 미노출, native `meter/progress` 미사용, label/value overflow 없음, console error 없음.
  - 증거:
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-qa.json`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-cycle-mobile.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-month-mobile.png`

## 남은 검증

- not verified yet: production `https://aretenald2018-sys.github.io/budget/`에는 아직 이번 변경을 배포하지 않았다.
- 이유: 현재는 계획의 실행 슬라이스 1 직후이며, 프로젝트 workflow상 다음 단계는 리뷰 세션이다. 리뷰 전 push/deploy는 수행하지 않았다.
- not verified yet: Android launcher widget 자체 디자인은 슬라이스 2 범위라 아직 변경/검증하지 않았다.

## 다음 액션

- 다음 상태: `ready_for_review`
- 다음 액션: 이 실행 변경 파일을 기준으로 리뷰 세션을 진행한다.
- 리뷰에서 문제 없으면 다음 실행 상태는 슬라이스 2 `Android 홈 화면 위젯 목록형 레이아웃`으로 넘어간다.
