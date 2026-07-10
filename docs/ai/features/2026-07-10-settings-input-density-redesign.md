# 설정 입력 밀도 미니멀 재설계

- 상태: `complete`
- ULW 세션: `.omo/ulw-loop/input-density-20260710/`
- 대상: 설정의 `예산 & 카테고리`, `보상 적립` 입력 흐름
- 실행 단위: 단일 슬라이스 `설정 전용 dense line-field 적용`

## 요청

프로덕트 화면에서 입력 칸의 두꺼운 테두리·큰 rounded box·중첩 카드가 차지하는 면적을 낮춘다. 평상시에는 입력 칸이 거의 드러나지 않는 미니멀한 형태로 바꾸고, 같은 첫 화면에 더 많은 텍스트 정보를 담는다.

## 그릴 결과

- 핵심 질문: 이 변경을 앱 전체의 `.tds-input` 기본값까지 확장할 것인가?
- 코드베이스 확인: `styles/00-foundation.css:444-460`의 공용 입력 클래스는 로그인, 거래 모달, 검색 등에도 쓰인다.
- 결정: 전역 기본값은 유지한다. `#tab-settings` 안의 예산·보상 적립 편집면만 새 dense line-field primitive를 적용한다.
- 사용자 의도: 두 제공 스크린샷은 복제 대상이 아닌 현재 과밀·두꺼운 UI의 증거다. 기존 라이트·보라 accent 디자인 시스템을 유지한 audit-and-redesign으로 진행한다.
- 실행 승인: 사용자 메시지 `구현시작`으로 승인되었고, 단일 슬라이스 구현과 리뷰를 마쳤다. production 배포만 별도 commit/push 권한 및 깨끗한 분리 범위가 필요하다.

## 확인된 문제

실제 authenticated production 화면을 In-app Browser 390×844에서 읽기 전용으로 측정했다.

- 예산 금액 input은 39px, 리듬 select는 36px이며 모두 `surface2` fill·사방 1px border·10px radius다.
- 보상 적립의 select/text/number input은 48px, `12px 14px` padding, 14px radius, fill·사방 border다.
- 포인트 항목 row는 항목당 277.6px이고, 감싸는 settings row도 68.3px 이상·16px radius·border·shadow를 중첩한다.

원인은 단일 input 크기보다 `settings row → inner card → field`의 세 겹 표면이다.

## 설계 결정

### Dense line-field

`#tab-settings` 내부의 text/number input 및 select에만 다음 정지 상태를 적용한다.

- 배경: 투명. `surface2` 채움 제거.
- 테두리: 좌·상·우 0px, 하단만 1px `var(--border)`.
- 반경·그림자: 0. input 자체의 rounded box와 static shadow를 제거.
- 크기: `min-height: 40px`, `padding-block: 6px`, `padding-inline: 0`, 14px/700. 현재 48px 보상 필드를 40px로 줄인다.
- 숫자: 우측 정렬·tabular figures를 유지한다.
- focus: `:focus` 및 `:focus-visible`에서 하단선을 `var(--primary)`로 바꾸고, 얇은 inset/outline feedback을 제공한다. static box를 되살리지 않는다.
- select: native `<select>`와 option, `data-rhythm-category-id` 계약을 유지한다. 별도 JavaScript, custom dropdown, 값 변환을 추가하지 않는다.

### 표면 계층 축소

- 예산의 `.budget-settings-card`를 직접 감싼 row와 `.reward-settings-row`만 border·shadow·rounded background 대신 row 사이의 얇은 divider와 작은 padding으로 구분한다.
- `.budget-settings-card`, `.reward-point-item-row`, `.reward-daily-settings`는 내부 card treatment를 제거하고 top divider와 grid만 남긴다.
- 계정 row, 섹션의 첫 요약 row, theme segmented control, toggle, home-managed chip은 의미 있는 그룹/선택 affordance이므로 유지한다.
- 예산 grid는 label과 금액/select의 폭을 조금 더 조밀하게 재배분하되, `.budget-goal-label`의 `nowrap + ellipsis` 계약은 그대로 유지한다.

### 디자인 시스템 문서화

`docs/design-system.md`에 settings 전용 dense line-field primitive와 default/focus/disabled/select states를 추가한다. 새 색상은 만들지 않고 기존 `--surface`, `--border`, `--text`, `--text-2`, `--primary` 토큰만 사용한다.

## 실행 범위

### 수정 대상

| 파일 | 변경 |
|---|---|
| `docs/design-system.md` | dense line-field token/상태/사용 범위를 문서화한다. |
| `styles/60-urge.css` | settings 내부의 field·nested row·budget/reward 편집부를 scoped CSS로 조밀하게 만든다. |
| `style.css` | 기존 import `v` 계약을 유지하면서 `settings=20260710-settings-density` cache-bust를 추가한다. |
| `index.html` | stylesheet query의 `settings` cache-bust를 같은 값으로 올린다. |
| `.omo/evidence/settings-input-density-20260710/settings-density-check.mjs` | temporary fixture server + real Chrome CDP 기반 RED/GREEN browser QA를 만든다. 이 파일은 production bundle에 포함하지 않는다. |

### 수정하지 않을 것

- `render-settings.js`의 DOM 구조, input type/name/value, `data-category-id`, `data-rhythm-category-id`, 저장·초기화 이벤트.
- 앱 전체 `.tds-input/.tds-select` 기본 규칙과 login/거래 modal UI.
- 포인트 수식, Firestore writes, Android 위젯, 앱 내 다른 탭.
- `sw.js`는 repository root에 없으므로 cache version 대상이 아니다.

## 실행 순서

1. `settings-density-check.mjs`를 기존 `mobile-nowrap-check.mjs` 패턴으로 작성한다. 390×844 fixture에는 실제 budget row와 reward fields를 포함하고 `style.css`를 로드한다.
2. 변경 전 `node .omo/evidence/settings-input-density-20260710/settings-density-check.mjs red`를 실행한다. 현재 fill·사방 border·rounded field 또는 nested shadow 때문에 non-zero 종료하고 `settings-density-red.json/png`를 남겨야 한다.
3. `docs/design-system.md`의 primitive 계약을 먼저 추가한다.
4. `styles/60-urge.css`에 settings scoped dense line-field와 divider-only inner surface를 구현한다. 전역 foundation rule은 건드리지 않는다.
5. `style.css`, `index.html` cache-bust를 같은 `20260710-settings-density` 값으로 갱신한다.
6. 같은 QA를 `after`와 focus mode로 실행한다. C001/C002 조건을 만족해야 한다.
7. `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check`를 실행한다.
8. 독립 visual QA에서 375×844, 768×1024, 1280×900 screenshot을 확인한다. 375px에서는 settings 첫 viewport, budget rows, reward fields, focus state를 우선 확인한다.
9. 작업트리에 다른 사용자 변경이 없고 commit/push 권한이 있을 때만 단일 목적 커밋을 만들어 `main`에 push한다. 그렇지 않으면 production deploy는 `not verified yet`와 정확한 blocker로 남긴다.
10. Pages workflow 성공 후 authenticated production에서 `설정 → 예산 & 카테고리 → 보상 적립`을 열어 저장하지 않고 UI와 console을 확인한다.

## 성공 기준과 증거

| ID | 시나리오 | PASS 증거 |
|---|---|---|
| C001 | `node .omo/evidence/settings-input-density-20260710/settings-density-check.mjs red` 후 `after`를 390×844에서 실행 | RED JSON/PNG가 현재 static box를 잡고, GREEN JSON/PNG가 target field의 transparent background·좌상우 0px border·하단 1px·0px radius·40px 이하 height·nested shadow 제거를 보인다. |
| C002 | 같은 fixture에서 첫 budget input을 focus하고 rhythm select를 선택하되 저장하지 않는다 | focus screenshot/JSON에서 visible focus, 최소 40px field height, select option 선택 가능, 모든 budget label의 one-line 또는 ellipsis가 확인된다. |
| C003 | `npm.cmd run verify`, `npm.cmd run pages:build`, production asset 확인, authenticated browser로 settings를 읽기 전용 확인 | 두 명령 exit 0, Pages HTTP 200/new cache-bust, settings render, console error 없음, data write 없음. |

## 리뷰 및 배포 판단

- 실행 뒤 review session은 이 문서와 diff만 대상으로 stale cache, focus state, CJK truncation, selector scope leakage를 검토한다.
- production UI는 기본 목표다. 다만 현재 작업트리에 GPS rewrite 등 사용자 변경이 다수 있으므로, 변경 파일만 안전하게 분리·commit·push할 수 없는 경우 배포하지 않는다.
- 해당 경우에도 build/fixture/visual QA는 수행하고 production 항목을 `not verified yet`로 명시한다.

## 다음 실행 진입점

commit `02811c1`을 main에 포함해 GitHub Pages workflow `29060496800`이 성공했고, authenticated production 설정 화면의 읽기 전용 검증까지 완료했다.
