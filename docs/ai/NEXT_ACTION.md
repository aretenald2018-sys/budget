# 다음 자동 액션

## 현재 상태

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-03-transport-subcategory-literal-unassigned.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-03-transport-subcategory-literal-unassigned.md`
- 실행 문서: `docs/ai/executions/2026-07-03-transport-subcategory-literal-unassigned.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-transport-subcategory-literal-unassigned-review.md`
- 현재 단계: 교통비용 `상세분류 미지정` 클릭 수정은 구현/검증/리뷰 완료, production 배포 대기
- 마지막 완료: `render-report.js`에서 빈 상세분류와 literal `상세분류 미지정` 문자열을 같은 미지정 상태로 처리하게 했고, `index.html`, `app.js`, `render-home.js` cache-bust를 `20260703-transport-unassigned`로 갱신했다. `node --check`, `git diff --check`, `npm.cmd run verify`, `npm.cmd run pages:build`, `_site` 정적 확인은 통과했다.
- 다음 액션: unrelated dirty worktree에서 이번 요청 변경만 안전하게 커밋/푸시할 수 있는지 결정한 뒤 production Pages workflow를 실행한다. 배포 후 로그인된 운영 UI에서 `교통비용` 상세 모달 -> `상세분류 미지정` -> `상세분류 지정` 시트 오픈을 확인한다.
- 차단 사유: 작업 시작 전부터 unrelated dirty changes가 대량으로 있었고, 이번 요청 파일인 `render-report.js`, `app.js`, `render-home.js`, `index.html`에도 기존 미커밋 변경이 섞여 있어 현재 상태로는 안전하게 production 커밋/푸시를 진행할 수 없다.

## 최근 처리한 Discord 요청

- Discord 요청: `devreq_discord_1510804891134595225`
- 계획 문서: `docs/ai/features/2026-07-03-transport-subcategory-literal-unassigned.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-03-transport-subcategory-literal-unassigned.md`
- 실행 문서: `docs/ai/executions/2026-07-03-transport-subcategory-literal-unassigned.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-transport-subcategory-literal-unassigned-review.md`
- 결과: `상세분류 미지정` literal 문자열도 미지정 거래로 판정해 교통비용 상세분류 시트 대상에 포함되게 수정했다.
- 차단: unrelated dirty worktree 때문에 production 커밋/푸시는 not verified yet.

## 이전 대기 작업

- Android 로컬 알림 수집 rebuild: `docs/ai/features/2026-07-03-android-local-notification-rebuild.md`
- 상태: 구현/검증 일부 완료, production/실기기 검증 대기
- 차단: unrelated dirty worktree 정리 및 Android 실기기 연결 필요

## 리뷰 대상 변경 파일

- `app.js`
- `index.html`
- `render-home.js`
- `render-report.js`
- `docs/ai/diagnoses/2026-07-03-transport-subcategory-literal-unassigned.md`
- `docs/ai/features/2026-07-03-transport-subcategory-literal-unassigned.md`
- `docs/ai/executions/2026-07-03-transport-subcategory-literal-unassigned.md`
- `docs/ai/reviews/2026-07-03-transport-subcategory-literal-unassigned-review.md`

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 "계속", "다음", "진행", "리뷰해", "해줘"처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다. 단, 기존 대기 액션과 충돌하면 어느 흐름을 계속할지 한 번만 확인한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다. 필요한 프롬프트 내용은 계획 문서와 이 파일에 남기고 에이전트가 직접 읽어 진행한다.
