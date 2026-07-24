# Default AI Development Workflow

This project uses a Superpowers-style workflow by default for every AI-assisted change.
Do not jump directly from a rough request to production edits.

## 문서 언어 규칙

- AI가 생성하는 계획, 리뷰, ADR, 로드맵, 핸드오프 문서는 기본적으로 한국어로 작성한다.
- 코드 식별자, 파일 경로, 명령어, API 이름, 라이브러리 이름, 환경 변수 이름, 인용 원문은 원래 언어를 유지한다.
- 사용자가 특정 산출물에 대해 다른 언어를 명시적으로 요청한 경우에만 그 산출물에 한해 따른다.

## 기본 스킬 트리거

슬래시 명령은 사용자가 직접 입력하지 않아도 요청 유형을 보고 자동 적용한다.

### `/grill-me`

기능, 디자인, UX, 아키텍처, 리팩토링, 제품 방향, 모호한 변경 요청에는 계획 세션의 첫 단계로 `/grill-me`를 적용한다.

- 한 번에 하나의 중요한 질문만 한다.
- 질문마다 추천 답변을 함께 제시한다.
- 코드베이스를 보면 답할 수 있는 질문은 사용자에게 묻지 말고 먼저 탐색한다.
- 의사결정이 갈리는 지점을 끝까지 확인한 뒤 계획 문서를 작성한다.
- 계획 문서에는 `그릴 결과` 섹션을 두고 핵심 질문, 답변, 결정, 남은 가정을 한국어로 기록한다.

### `/diagnose`

버그, 오류, 실패, 깨짐, 동작 안 함, 회귀, 성능 저하, 느림, 간헐적 실패 요청에는 구현보다 먼저 `/diagnose`를 적용한다.

- 먼저 재현/피드백 루프를 만든다. 테스트, CLI 스크립트, fixture, HTTP 확인, 브라우저 확인 중 가장 빠르고 믿을 수 있는 루프를 고른다.
- 재현 전에는 원인 추측으로 바로 수정하지 않는다.
- 사용자가 말한 증상과 같은 실패인지 확인한다.
- 3-5개의 반증 가능한 원인 가설을 세우고 우선순위를 매긴다.
- 계측은 가설을 검증하는 최소 범위로만 넣고, 임시 로그에는 고유 태그를 붙여 마지막에 제거한다.
- 수정 후 원래 재현 루프와 회귀 검증을 다시 실행한다.
- 진단이 길어지면 `docs/ai/diagnoses/YYYY-MM-DD-short-slug.md`에 한국어로 기록한다.

### 우선순위

- 버그 증상이 있으면 `/diagnose`가 `/grill-me`보다 우선한다.
- 새 기능이나 방향성 변경이면 `/grill-me`가 우선한다.
- 아키텍처 개선은 명시 요청이 있을 때만 별도 계획으로 다루고, 일반 기능 실행에 섞지 않는다.

## 자동 진행 상태

`docs/ai/NEXT_ACTION.md`가 다음 세션의 진입점이다. 에이전트는 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.

- 세션 시작 시 `docs/ai/NEXT_ACTION.md`를 먼저 읽고, 대기 중인 액션이 사용자의 새 요청과 충돌하지 않으면 바로 진행한다.
- 사용자가 "계속", "다음", "진행", "리뷰해", "해줘"처럼 짧게 말하면 `NEXT_ACTION.md`의 다음 액션을 실행한다.
- 계획 세션이 끝나면 `ready_for_execution` 또는 `needs_user_decision`으로 갱신한다.
- 실행 세션이 끝나면 `ready_for_review`로 갱신한다.
- 리뷰 세션이 끝나면 결과에 따라 `ready_for_fix`, `ready_for_execution`, `complete` 중 하나로 갱신한다.
- 같은 세션에서 다음 단계까지 안전하게 이어갈 수 있으면 자동으로 이어가되, 컨텍스트가 커졌거나 검증/사용자 결정이 필요하면 `NEXT_ACTION.md`에 상태를 남기고 멈춘다.

## Budgetproject 운영 배포 기본값

이 프로젝트의 기본 전달 대상은 로컬 `5501` 개발 서버가 아니라 운영 GitHub Pages다.

- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
- 정적 앱 배포 워크플로: `.github/workflows/pages.yml` (`Deploy GitHub Pages`)
- 구현/리뷰 완료 후 기본 검증 순서:
  1. `npm.cmd run verify`
  2. `npm.cmd run pages:build`
  3. 의도한 변경만 커밋/푸시해서 `main`의 GitHub Pages 배포를 트리거한다.
  4. `Deploy GitHub Pages` workflow 성공과 운영 URL의 실제 UI 상태를 확인한다.
- 의도한 변경이 이미 커밋된 상태라면 기본 배포 명령은 `npm.cmd run deploy:pages`다.
- `npm.cmd run dev`, `python -m http.server 5501`, `localhost:5501`, `127.0.0.1:5501`은 디버그 보조 수단이다. 최종 핸드오프의 기본 시작 명령/URL로 쓰지 않는다.
- 운영 배포가 불가능하면 로컬 서버로 말을 돌리지 말고 `not verified yet`와 정확한 차단 사유를 남긴다. 예: unrelated dirty worktree, GitHub 인증 없음, secret 없음, push 권한 없음, Actions 실패.
- 계획 문서의 검증 단계도 기본적으로 운영 Pages 확인을 포함해야 한다. 로컬 dev server 확인은 production 확인을 대체하지 못한다.

## Non-negotiable Flow

1. Planning session
2. Execution session
3. Review session

If the user asks for implementation without naming an approved plan file, treat the request
as a planning-session request first. The only normal edits in a planning session are files
under `docs/ai/` or `docs/adr/`.

## 구상 세션 (새 화면·새 흐름)

**새 화면 또는 새 사용자 흐름**을 만들 때만 적용하는, 기존 워크플로우 앞단의 프로토타입 단계다.
기존 화면 수정·버그는 이 세션을 건너뛰고 기존 계획(`/grill-me`)·진단(`/diagnose`) 세션을 그대로 쓴다.

배경: 서비스 기획에서 화면·클릭 프로토타입("뭘 눌렀을 때 뭐가 나오는지")은 보통 피그마류 별도 도구로
만들어 개발 단계에서 버려지고 재구현된다. 이때 동작이 비는 번역 손실이 생긴다. 이 프로젝트는 별도 도구
대신 **fixture 모드(`?fixture=<scenario>`, `e2e-guide.md` 참조)를 프로토타입 매체로 쓴다.** 코드베이스
위에서 조립한 프로토타입은 버려지지 않고 그대로 구현(경화)의 시작점이 되어 번역 손실이 없다.

### 입력

- 사용자의 **허브 화면 구상 하나**(이미지 또는 설명)면 충분하다. 예: 홈 같은 진입 화면.
- 하위 화면·연결점 전체를 사용자에게 요구하지 않는다. 허브에서 파생되는 그래프를 뻗어나가는 것은 AI의 몫이다.

### 절차

1. AI가 허브 구상에서 **화면 그래프**를 뻗어나가며 제안한다: 필요한 하위 화면 목록, 각 요소의 이동 대상,
   사용자 흐름(진입→행동→결과) 초안. 산출물은 `docs/ai/flows/<flow-slug>.md`
   (`docs/ai/flows/TEMPLATE.md` 형식).
2. 갈리는 연결·동작은 화면 계약서 규칙과 동일하게 **객관식 질문(추천안 포함)**으로 제시한다.
   미답변 항목은 AI 기본값을 적용하되 `가정`으로 표시한다. (계약서 §4와 같은 형식)
3. AI가 **클릭 가능한 프로토타입**을 실제 앱 셸 위에 fixture 데이터로 조립한다. 실행:
   `npm run dev` 후 `?fixture=<scenario>`. 미확정 화면·동작은 빈 핸들러가 아니라 **명시적 스텁**
   (비활성 + "준비중" 표기)으로 만들고, 스텁임을 흐름 문서·계약서에 기록한다.
   ("장식용 데이터 금지"·"동작 없는 버튼 금지" 규칙과 일치한다.)
4. 사용자가 직접 눌러보고 피드백 → 흐름 문서·계약서·프로토타입을 갱신하는 루프를 돈다.
5. 흐름이 확정되면 화면별 계약서(`docs/ai/contracts/`)를 `confirmed`로 올리고, 이후는 기존
   Planning→Execution→Review로 **화면 단위 경화**(데이터 계약, 단위 테스트, E2E, 시각 베이스라인)를
   진행한다. **프로토타입 코드는 버리지 않고 경화의 시작점이 된다.**

### 프로토타입 단계의 허용 범위

- 이 세션은 예외적으로 앱 코드를 만질 수 있으나(프로토타입 조립), **기존 화면의 동작을 바꾸지 않는
  추가·스텁에 한정**한다.
- 운영 데이터 경로(Firestore 쓰기)는 연결하지 않는다 — **fixture store 안에서만 동작**한다.
  (fixture 모드의 쓰기는 인메모리에만 반영된다 — `e2e-guide.md` 참조.)

### 완료 판정

- 프로토타입은 `docs/ai/DEFINITION_OF_DONE.md` 대상이 아니다(스텁 허용). DoD는 경화 슬라이스부터 적용한다.
- 시각 회귀 베이스라인에 스텁 화면을 넣을지는 경화 시점에 결정한다.

## Planning Session

Purpose: turn a rough request into a small, executable plan.

Required behavior:

- Ask one important question at a time when the answer changes the design.
- If the answer can be discovered from the codebase, inspect the code instead of asking.
- Split work into non-overlapping execution sessions.
- Keep each execution session to one functional change.
- Identify files/modules likely to be touched.
- Define what must not be implemented in that session.
- Define verification steps and the expected proof.
- Save the plan under `docs/ai/features/YYYY-MM-DD-short-slug.md`.
- 다음 세션 시작 프롬프트는 계획 문서에 기록하되, 사용자에게 복붙을 요구하지 않는다.
- 다음 실행 슬라이스가 자동으로 시작될 수 있도록 `docs/ai/NEXT_ACTION.md`를 갱신한다.

Do not edit app code in the planning session.

### 화면 계약서 (UI 동작이 걸린 변경)

UI 동작이 바뀌거나 새로 생기는 변경이면, 계획 세션에서 `docs/ai/contracts/<screen>.contract.md`를
`docs/ai/contracts/TEMPLATE.md` 기반으로 생성하거나 갱신한다. 이 계약서가 "이 화면이 어떻게 작동해야
하는가"의 단일 출처다. (시각 기준은 여기 쓰지 않는다 — 그건 `docs/design-system.md`의 몫이다.)

**작성 주체는 AI다.** 사용자는 사전 지식 없이 모든 동작을 미리 정의할 수 없으므로, "사람이 계약서를 먼저
다 쓴다"는 전제를 뒤집는다.

- 코드·이미지에서 확정 가능한 동작은 AI가 먼저 채운다. 코드를 보면 알 수 있는 동작은 사용자에게 묻지 않는다.
- 갈리는 동작만 계약서 §4에 객관식 질문으로 남긴다. 질문마다 추천안과 그 사유를 함께 제시한다.
- 사용자가 답하지 않은 항목은 AI 기본값을 적용하되 `가정`으로 명시 표시한다.
- 미확정 질문이 모두 답변 또는 `가정` 처리되면 계약서 상태를 `draft` → `confirmed`로 올린다.

이는 새 규칙이 아니라 기존 `/grill-me` 규칙("추천 답변을 함께 제시한다", "코드베이스를 보면 답할 수 있는
질문은 묻지 말고 먼저 탐색한다")의 산출물 형식이다. 계약서는 `/grill-me`의 `그릴 결과`가 화면 단위로
남는 자리다.

## 버그 안정화 우선

핵심 사용자 흐름이 깨진 상태에서는 신규 기능 계획을 잡지 않는다. 먼저 그 흐름을 안정화한다.

"깨진 상태"의 예:

- 주요 버튼이 눌러도 아무 일도 일어나지 않음.
- 화면에 보이는 값과 실제 데이터가 불일치함.
- 저장이 되지 않거나, 저장한 값이 유지되지 않음.
- 화면 이동(탭 전환·모달 열기)이 끊기거나 되돌아가지 않음.
- 주요 해상도(320 / 360 / 390 / 412px)에서 UI가 잘리거나 겹침.

버그는 증상 단위가 아니라 **근본 원인 단위로 묶는다.** 화면마다 내비게이션이 제각각이라 여러 화면에서
이동이 어긋난다면, 화면별 개별 수정이 아니라 공통 구조를 정리하는 하나의 슬라이스로 다룬다. 근본원인
묶음은 `docs/ai/ROADMAP.md`에 백로그로 남기고, 착수 전 `docs/ai/features/`에 계획 문서를 만든다.

버그 증상이 있으면 `/diagnose`가 `/grill-me`보다 우선한다(위 "우선순위" 참조)는 규칙과 결이 같다.

## 장식용 데이터 금지

운영 렌더 경로에 고정 배열·무작위 값·데모용 수치를 넣지 않는다. "화면이 비어 보이지 않게" 하려고 가짜
숫자로 채우는 것은 데이터 불일치 버그의 원천이다.

fixture(테스트·프리뷰용 가짜 데이터)는 아래 네 조건을 모두 만족할 때만 허용한다.

1. 실데이터와 **동일한 스키마**를 따른다.
2. fixture임이 **코드에서 명확**하다(이름·주석·주입 지점으로 구분됨).
3. **운영 빌드/기본 경로에서 미사용**이다(평상시 URL·배포 산출물에 영향 없음).
4. **테스트 시나리오별 존재 조건**이 있다(어느 시나리오에서 왜 쓰는지 명시).

현재 위반 사례: `features/home/dashboard.js`의 `DEFAULT_MODEL`(하드코딩 샘플 금액·카테고리·추세 배열)과
폴백 스파크라인 배열(`[8, 11, ...]`, `[40, 38, ...]`)은 운영 렌더 경로에 남아 있는 장식용 데이터다.
데이터가 없거나 짧을 때 이 배열이 실데이터인 것처럼 그려진다 — `docs/ai/ROADMAP.md`의 근본원인 묶음 A로
백로그화되어 있다.

## Execution Session

Purpose: implement exactly one approved slice from a plan document.

Required behavior:

- Start by reading the named plan file.
- Implement one slice only.
- Do not bundle adjacent features, cleanup, redesign, or refactors unless the plan explicitly includes them.
- Update the plan status when useful.
- Follow existing architecture and project rules.
- Verify with the plan's verification steps.
- 완료 판단은 `docs/ai/DEFINITION_OF_DONE.md`의 기준을 충족해야 한다. "코드상 맞을 것"은 완료가 아니다.
- If verification is blocked, say `not verified yet` and name the blocker.
- 변경 파일과 리뷰 대상을 포함해 `docs/ai/NEXT_ACTION.md`를 `ready_for_review`로 갱신한다.

## Review Session

Purpose: review the executed slice before moving to the next one.

Required behavior:

- Start by reading the plan file and the changed files.
- Look first for bugs, regressions, missing verification, stale cache/service-worker issues, and UX breaks.
- `docs/ai/DEFINITION_OF_DONE.md`의 기준을 체크리스트로 삼아 슬라이스가 실제로 완료됐는지 확인한다.
- 가능하면 Playwright(`npm run test:e2e`)로 브라우저를 실제 조작하고 시각 회귀를 확인한다. E2E·시각 회귀
  인프라는 별도 슬라이스에서 도입 예정이므로, 도입 후부터 이 항목을 적용한다. 도입 전에는 운영 Pages에서의
  실조작 확인으로 대체한다.
- Do not implement new feature work during review.
- Save review notes under `docs/ai/reviews/YYYY-MM-DD-short-slug-review.md` when the review is substantial.
- If issues are found, the next session is a focused fix session for those issues only.
- 리뷰 결과에 따라 `docs/ai/NEXT_ACTION.md`를 `ready_for_fix`, `ready_for_execution`, `complete` 중 올바른 상태로 갱신한다.

## Context Hygiene

- Prefer durable documents over chat memory.
- 계획 후 실행이나 실행 후 리뷰가 새 세션에서 시작되면 `NEXT_ACTION.md`를 읽고 자동 재개한다.
- 같은 세션에서 이어갈 때도 계획 문서와 `NEXT_ACTION.md`를 다시 읽어 현재 단계와 범위를 확인한 뒤 진행한다.
- Use `docs/ai/CONTEXT.md` for project vocabulary and domain assumptions.
- Use `docs/adr/` for decisions that would be expensive to reverse.

## Shortcut Handling

If the user says any of the following:

- "do it"
- "implement this"
- "fix this"
- "just change it"
- "build the feature"

The default response is still to create or update a plan first, unless the user points to an
approved `docs/ai/features/*.md` file and asks to execute a specific slice.
