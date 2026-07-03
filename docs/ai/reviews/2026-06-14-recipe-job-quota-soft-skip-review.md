# recipe job Firestore quota soft skip 리뷰

## 범위

- 계획: `docs/ai/features/2026-06-14-recipe-job-quota-soft-skip.md`
- 변경 파일:
  - `scripts/github-recipe-sync.mjs`
  - `.github/workflows/budget-backend.yml`
  - `docs/ai/NEXT_ACTION.md`
  - `docs/ai/diagnoses/2026-06-14-recipes-job-firestore-quota.md`
  - `docs/ai/features/2026-06-14-recipe-job-quota-soft-skip.md`

## 결과

- 차단 이슈 없음.

## 확인 내용

- `scripts/github-recipe-sync.mjs`는 `err.code === 8`이면서 메시지/상세/stack에 `RESOURCE_EXHAUSTED` 또는 `quota`가 있는 경우만 soft skip한다.
- soft skip 경로는 `{ ok: true, status: "skipped", reason: "firestore_quota_exhausted" }` JSON을 출력하고 exit code `0`으로 자연 종료한다.
- quota가 아닌 오류는 기존처럼 exit code `1`을 유지한다.
- `.github/workflows/budget-backend.yml`의 cron과 `jobs.recipes.if` schedule 문자열이 모두 `17 */6 * * *`로 일치한다.
- Node.js 20 deprecation warning은 이번 실패 원인이 아니며, 워크플로는 계속 Node 24를 사용한다.

## 검증

- `node --check scripts/github-recipe-sync.mjs` 통과
- `npm.cmd run verify` 통과 (`verify-project passed (95 JS files checked).`)
- `git diff --check` 통과

## 남은 검증

- not verified yet: 이 변경은 아직 `main`에 push되지 않았으므로 GitHub Actions `Budget Backend Jobs`의 `workflow_dispatch` / `mode=recipes` 운영 run green 여부는 배포 후 확인해야 한다.
- quota가 실제로 고갈된 상태에서는 run 로그에 `status: "skipped"`와 `reason: "firestore_quota_exhausted"`가 나오고 job이 green이면 성공이다.
