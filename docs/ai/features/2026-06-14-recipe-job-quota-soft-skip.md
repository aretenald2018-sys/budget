# recipe job Firestore quota soft skip

## 배경

2026-06-14 KST에 schedule로 실행된 `Budget Backend Jobs` run `27482004916`의 `recipes` job이 Firestore `8 RESOURCE_EXHAUSTED: Quota exceeded.`로 실패했다. 실패는 `node scripts/github-recipe-sync.mjs` 실행 중 Firestore query에서 발생했고, 스크립트의 최상위 catch가 모든 오류를 exit `1`로 처리해 예약 workflow 전체를 실패 상태로 만들었다.

진단 문서: `docs/ai/diagnoses/2026-06-14-recipes-job-firestore-quota.md`

## 목표

- Firestore quota 고갈이 발생해도 예약 `recipes` job이 빨간 실패로 반복되지 않게 한다.
- quota 압박을 줄이기 위해 recipes schedule 빈도를 낮춘다.
- 실제 코드 결함이나 secret 누락 같은 다른 오류는 계속 실패로 드러나게 한다.

## 비목표

- Firestore 요금제/쿼터 자체 변경
- 운영 Firestore 데이터 수정
- recipe parser/LLM 품질 변경
- Gmail sync, ingest job 동작 변경
- 새 Firestore index 설계

## 슬라이스 1: recipes job quota soft skip

### 변경 파일

- `scripts/github-recipe-sync.mjs`
- `.github/workflows/budget-backend.yml`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/reviews/2026-06-14-recipe-job-quota-soft-skip-review.md`

### 구현

1. `scripts/github-recipe-sync.mjs`의 최상위 catch에서 Firestore quota 오류만 감지한다.
2. 감지 조건은 `err.code === 8`, `RESOURCE_EXHAUSTED`, `Quota exceeded`, `quota` 같은 Firestore/gRPC 오류 형태를 포괄한다.
3. quota 오류면 `console.warn()`으로 원문을 남기고, `console.log()`로 `{ ok: true, status: "skipped", reason: "firestore_quota_exhausted" }` JSON을 출력한 뒤 exit `0`으로 끝낸다.
4. quota가 아닌 오류는 기존처럼 exit `1`로 둔다.
5. `.github/workflows/budget-backend.yml`의 recipes schedule을 30분마다에서 하루 4회로 낮추고, job `if` 조건의 schedule 문자열도 같이 갱신한다.

### 검증

- `node --check scripts/github-recipe-sync.mjs`
- `npm.cmd run verify`
- 배포 후 GitHub Actions `Budget Backend Jobs`를 `workflow_dispatch` / `mode=recipes`로 실행한다.
- quota가 정상인 경우 green run과 `ok: true` JSON을 확인한다.
- quota가 고갈된 경우에도 green run, `status: "skipped"`, `reason: "firestore_quota_exhausted"` 로그를 확인한다.

## 실행 결과

- `scripts/github-recipe-sync.mjs`의 최상위 catch에서 Firestore quota 오류만 soft skip으로 처리하도록 수정했다.
- soft skip 로그는 `{ ok: true, status: "skipped", reason: "firestore_quota_exhausted" }` JSON을 출력하고 exit code `0`으로 자연 종료한다.
- quota가 아닌 오류는 기존처럼 `[github-recipe-sync]` 로그 후 exit code `1`로 유지한다.
- `.github/workflows/budget-backend.yml`의 recipes schedule을 `*/30 * * * *`에서 `17 */6 * * *`로 낮췄고, job `if` 조건도 같은 문자열로 갱신했다.
- 검증:
  - `node --check scripts/github-recipe-sync.mjs` 통과
  - `npm.cmd run verify` 통과 (`verify-project passed (95 JS files checked).`)
- not verified yet: 이 로컬 변경은 아직 `main`에 push되지 않았으므로 GitHub Actions `workflow_dispatch` / `mode=recipes` 운영 run green 여부는 배포 후 확인해야 한다.
