# 2026-06-30 오늘 이용금액 미반영 진단

## 증상

- 사용자 문의: "왜 오늘 이용금액은 하나도 어플에 안잡히나"
- 기준일: 2026-06-30 KST.

## 확인한 루프

1. 운영 Firestore를 오늘 KST 범위로 직접 조회하려 했다.
   - 조회 대상: `users/{USER_UID}/transactions`, `users/{USER_UID}/raw_messages`, `mailboxes/{mailboxId}/raw_messages`.
   - 결과: `8 RESOURCE_EXHAUSTED: Quota exceeded.`
2. GitHub Actions `Budget Backend Jobs` 최근 실행을 확인했다.
   - 2026-06-30 09:12 KST, run `28411269388`, event `schedule`, job `sync` 실패.
   - 2026-06-30 13:19 KST, run `28419989032`, event `schedule`, job `recipes` 성공. `sync`/`ingest`는 해당 schedule에서 skipped.
3. 실패한 `sync` job 로그를 확인했다.
   - `gmail.error`: `Bad Request`
   - `raw.processed`: `5`
   - `raw.parsed`: `2`
   - `raw.failed`: `3`
   - 실패 raw 3건의 error: `Gemini: This model is currently experiencing high demand...`
   - parsed 2건은 같은 transaction `ACLP5TQhNKwHimlE5JS9`로 연결되었고, 그중 1건은 duplicate였다.
4. 최근 50개 GitHub Actions run을 확인했다.
   - 모두 `event: schedule`.
   - `repository_dispatch` / `budget_ingest` run은 보이지 않았다.

## 판단

오늘 이용금액이 앱에 안 보이는 원인은 하나가 아니라 세 가지가 겹쳐 있다.

1. **운영 Firestore quota가 현재 고갈됨**
   - 로컬에서 읽기만 해도 `RESOURCE_EXHAUSTED`가 발생했다.
   - 이 상태에서는 앱 읽기/백엔드 쓰기/재처리 모두 불안정하거나 실패할 수 있다.

2. **오늘 정기 `sync` job이 실패함**
   - Gmail 경로는 `Bad Request`로 실패했다.
   - raw 재처리는 일부 진행됐지만 3건이 Gemini high demand로 실패해 거래 저장까지 가지 못했다.
   - 따라서 오늘 들어온/쌓여 있던 일부 이용금액은 raw 상태로 남았을 가능성이 높다.

3. **실시간 `budget_ingest` run이 보이지 않음**
   - MacroDroid가 GitHub `repository_dispatch(event_type=budget_ingest)`를 정상 호출했다면 Actions run이 보여야 한다.
   - 최근 run 목록에는 schedule만 보여, 오늘 폰 알림/SMS가 즉시 ingest로 들어오지 않았거나 다른 경로에서 누락됐을 가능성이 있다.

## 반증 가능한 가설

1. 앱 화면 필터/표시 문제다.
   - 현재는 가능성이 낮다. Firestore quota와 backend sync 실패가 확인됐다.
2. MacroDroid가 오늘 알림을 전송하지 않았다.
   - 가능성이 높다. `repository_dispatch` run이 보이지 않는다.
3. raw는 들어왔지만 파싱이 실패했다.
   - 가능성이 높다. `sync` 로그에서 pending raw 5건 중 3건이 Gemini high demand로 실패했다.
4. Gmail 영수증 기반 거래가 들어오지 않았다.
   - 가능성이 높다. Gmail poll 자체가 `Bad Request`로 실패했다.
5. Firestore quota 때문에 앱이 최신 데이터를 못 읽는다.
   - 가능성이 높다. 로컬 read도 quota 오류를 냈다.

## 즉시 조치

1. Firestore quota가 풀릴 때까지 기다리거나 Firebase 요금제/quota를 확인한다.
2. quota가 풀린 뒤 오늘 날짜로 sync를 다시 실행한다.
   - GitHub Actions: `Budget Backend Jobs` -> `workflow_dispatch` -> `mode=sync`, `since=2026-06-30`, `max=120`
   - CLI: `gh workflow run "Budget Backend Jobs" -f mode=sync -f since=2026-06-30 -f max=120`
3. MacroDroid 쪽에서 오늘 알림 발송 액션이 실제로 GitHub `repository_dispatch`를 호출했는지 확인한다.
4. Gmail `Bad Request`는 기존 Gmail OAuth/token 계열 문제와 같은 양상이다. `npm.cmd run gmail:auth`로 refresh token 재발급이 필요할 수 있다.
5. Gemini high demand 실패 raw는 quota/Gemini 상태가 안정된 뒤 pending raw 재처리로 회복 가능하다.

## 코드 수정 후보

- `scripts/github-sync-latest.mjs`에서 Gmail 실패나 recipes 실패가 있어도 raw 재처리 성공분은 run 전체를 실패로 끝내지 않도록 결과 정책을 분리한다.
- Gemini high demand는 재시도/backoff 또는 deterministic parser 확대가 필요하다.
- recipes job의 Firestore quota 완화 변경이 현재 워크트리에 남아 있으므로, 배포 여부를 분리 확인한다.
- 앱/설정 화면에 "마지막 sync 실패 원인"을 표시하면 사용자가 앱 문제와 수집 문제를 구분하기 쉽다.
