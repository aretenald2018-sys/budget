# recipes job Firestore quota 실패 진단

## 증상

- GitHub Actions `Budget Backend Jobs` run `27482004916`
- 트리거: schedule, 커밋 `e9e370f4a114283adfc303c5528fa0d47c524608`
- 실패 job: `recipes`
- 실패 단계: `Analyze pending recipe videos`
- 실패 명령: `node scripts/github-recipe-sync.mjs`
- 로그 핵심:
  - `[github-recipe-sync] Error: 8 RESOURCE_EXHAUSTED: Quota exceeded.`
  - Firestore query stack에서 발생
  - exit code `1`

Node.js 20 deprecation warning은 별도 경고이며 이번 실패의 직접 원인이 아니다. 워크플로는 이미 `node-version: 24`와 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`를 사용한다.

## 재현/피드백 루프

1. `gh run view 27482004916 --log-failed`로 운영 실패 로그를 확인했다.
2. `.github/workflows/budget-backend.yml`에서 `recipes` job이 30분마다 실행되는 schedule임을 확인했다.
3. `scripts/github-recipe-sync.mjs`가 `processPendingRecipeItems()` 오류를 모두 exit `1`로 처리함을 확인했다.
4. `api/_lib/recipe-analysis.js`가 실행 시작 시 Firestore `cart_items`를 최대 `lookback`만큼 조회함을 확인했다.

## 가설

1. 가장 가능성 높음: Firestore 무료/프로젝트 quota가 이미 고갈된 상태에서 `recipes` job의 첫 query가 `RESOURCE_EXHAUSTED`를 반환했고, 스크립트가 이를 fatal로 처리했다.
2. 가능성 있음: 30분 주기 recipes scan이 실제 처리할 pending recipe가 없어도 하루 48회 Firestore read를 반복해 quota 압박을 키운다.
3. 가능성 낮음: Node 24 강제 실행 경고가 실패를 만들었다. 실제 stack은 Firestore quota 오류라 직접 원인에서 제외한다.
4. 가능성 낮음: Gemini quota 고갈이다. 이번 로그의 오류는 `generativelanguage`가 아니라 Firestore gRPC query stack에서 발생했다.

## 결정

- Firestore quota 고갈은 코드 결함이라기보다 일시적인 외부 한도 상태이므로 scheduled recipe job에서는 성공 종료하되 `status: "skipped"`와 `reason: "firestore_quota_exhausted"`를 JSON 로그로 남긴다.
- 다른 오류는 기존처럼 exit `1`로 유지한다.
- recipes schedule은 30분마다에서 하루 4회로 낮춰 불필요한 Firestore read를 줄인다.
- Gmail/ingest/sync job은 이번 변경 범위에서 제외한다.

## 검증 계획

- `node --check scripts/github-recipe-sync.mjs`
- `npm.cmd run verify`
- GitHub Actions 수동 실행: `Budget Backend Jobs` -> `workflow_dispatch`, `mode=recipes`
- 기대 결과:
  - 정상 quota 상태: job green, `ok: true` JSON 출력
  - quota 고갈 상태: job green, `status: "skipped"`, `reason: "firestore_quota_exhausted"` JSON 출력
