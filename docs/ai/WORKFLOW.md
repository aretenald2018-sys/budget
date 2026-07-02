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

## Execution Session

Purpose: implement exactly one approved slice from a plan document.

Required behavior:

- Start by reading the named plan file.
- Implement one slice only.
- Do not bundle adjacent features, cleanup, redesign, or refactors unless the plan explicitly includes them.
- Update the plan status when useful.
- Follow existing architecture and project rules.
- Verify with the plan's verification steps.
- If verification is blocked, say `not verified yet` and name the blocker.
- 변경 파일과 리뷰 대상을 포함해 `docs/ai/NEXT_ACTION.md`를 `ready_for_review`로 갱신한다.

## Review Session

Purpose: review the executed slice before moving to the next one.

Required behavior:

- Start by reading the plan file and the changed files.
- Look first for bugs, regressions, missing verification, stale cache/service-worker issues, and UX breaks.
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
