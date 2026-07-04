# 위젯/홈 그래프 목록형 디자인 리뷰 - 슬라이스 1

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-04-widget-home-graph-list-design.md`
- 실행: `docs/ai/executions/2026-07-04-widget-home-graph-list-design-slice1.md`
- 범위: 웹 홈 `오늘의 적립` 포인트 row와 홈 변동비 row의 목록형 위젯 primitive 적용
- 제외 범위: Android launcher widget layout/provider는 슬라이스 2 범위라 리뷰 대상이 아니다.

## 결론

- 판정: 통과
- 차단 이슈: 없음
- 다음 상태: `ready_for_execution`
- 다음 실행 대상: 슬라이스 2 `Android 홈 화면 위젯 목록형 레이아웃`

## 확인한 사항

- 요구사항 대조:
  - 2번 사진의 초록/회색 팔레트를 복사하지 않고, row anatomy만 가져왔다.
  - `docs/design-system.md`에 `목록형 위젯 그래프` primitive가 추가됐다.
  - `render-report.js`의 홈 포인트 row와 홈 변동비 row가 `.home-widget-*` row shell/fill/mark/name/value/meta 구조를 사용한다.
  - 리포트 탭 일반 gauge row는 기존 구조를 유지한다.
  - Android 파일은 이번 슬라이스에서 수정하지 않았다.
- 캐시/배포 계약:
  - `style.css`, `index.html`, `app.js`, `render-home.js`가 `20260704-widget-home-graph-list` cache-bust를 참조한다.
  - `scripts/verify-project.mjs`가 새 design/CSS/render token을 검사한다.
  - repo root에 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION`은 없어 service worker cache bump 대상은 없다.
- 보안/데이터 경계:
  - Firestore, Gmail, receipt, Android notification ingest, secret 경로 변경은 없다.
  - 새 DOM 출력은 기존 `escHtml()` 경계를 유지한다.

## 검증

- `git diff --check`: 통과
- `node --check render-report.js && node --check scripts/verify-project.mjs && node --check app.js && node --check render-home.js`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (87 JS files checked)`
- `npm.cmd run pages:build`: 통과, `_site` artifact 생성 완료
- Playwright visual QA:
  - 실행 세션 증거:
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-qa.json`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-cycle-mobile.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design/visual-home-widget-month-mobile.png`
  - 리뷰 세션 추가 증거:
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-responsive-qa.json`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-cycle-340.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-month-340.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-cycle-390.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-month-390.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-cycle-430.png`
    - `.omo/evidence/2026-07-04-widget-home-graph-list-design-review/visual-home-widget-month-430.png`
  - 리뷰 QA 결과:
    - 340px, 390px, 430px에서 `이번 2주`/`이번 달` 모두 렌더.
    - 각 상태에서 포인트 row 3개, 변동비 row 3개 이상 확인.
    - `2x2`, `4x2` preview 크기 텍스트 미노출.
    - native `meter`/`progress` 미사용.
    - row label/value hard overflow 없음.
    - console error 없음.

## 비차단 잔여 리스크

- not verified yet: production `https://aretenald2018-sys.github.io/budget/`에는 아직 이번 변경이 배포되지 않았다.
  - 이유: 현재 worktree에는 이번 목표 외 `docs/ai/features/2026-07-04-telegram-newsfeed.md` 같은 unrelated dirty file이 함께 있어 production push/deploy를 안전하게 수행하지 않았다.
- not verified yet: `/visual-qa`의 독립 subagent dual-oracle pass는 실행하지 못했다.
  - 이유: 현재 Codex subagent 도구 정책이 사용자가 명시적으로 요청한 경우에만 `spawn_agent`를 허용한다.
  - 보완: main session에서 실제 Playwright 캡처와 source/contract review를 수행했다.
- not verified yet: Android launcher widget 디자인은 계획의 슬라이스 2 범위라 아직 변경/검증하지 않았다.

## 다음 액션

- 슬라이스 2 `Android 홈 화면 위젯 목록형 레이아웃`을 실행한다.
- 웹 홈 그래프 추가 리디자인은 하지 않는다.
