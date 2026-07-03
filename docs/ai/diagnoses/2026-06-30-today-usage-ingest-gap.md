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

## 2026-06-30 20:14 KST 추가 확인

사용자가 "알람이 왔는데 가계부등록안됨"이라고 다시 보고했다.

추가 확인 루프:

1. GitHub Actions `repository_dispatch` 실행을 재확인했다.
   - `gh run list --workflow budget-backend.yml --event repository_dispatch --limit 20`
   - 결과: 출력 없음. 즉 최근 `budget_ingest` 실행이 보이지 않는다.
2. 오늘 날짜 기준 수동 sync를 실행했다.
   - 실행: `gh workflow run budget-backend.yml -f mode=sync -f since=2026-06-30 -f max=120`
   - run: `28440131005`
   - 결과: workflow 전체는 실패. 원인은 기존과 같은 Gmail `Bad Request`.
   - raw 재처리 자체는 수행됨: `processed=7`, `parsed=0`, `skipped=7`, `failed=0`.
3. 운영 Firestore의 최근 `users/{USER_UID}/raw_messages` 12건을 조회했다.
   - 2026-06-30 17:19 KST: 쿠팡 배송 완료 알림, `skipped`.
   - 2026-06-30 14:34 KST: 네이버파이낸셜 인증번호 알림/SMS 중복, `skipped`.
   - 2026-06-30 14:14 KST: 롯데택배 배송 완료 알림, `skipped`.
   - 2026-06-30 10:38 KST: 롯데택배 집배송 안내, `skipped`.
   - 최근 raw 중 실제 결제/송금으로 보이는 것은 2026-06-29 18:20 KST 하나은행 대출이자 출금 건과 2026-06-27 12:39 KST 현대카드 OpenAI 승인 건이며, 둘 다 이미 `parsed`.

추가 판단:

- 현재 보고된 "알람"이 결제 알림이었다면, 그 알림은 GitHub `budget_ingest`까지 도착하지 않았다.
- Firestore에 들어온 최근 알림들은 배송/인증번호/데이터 사용량 등 비거래 알림이어서 `skipped`가 맞다.
- raw 문서의 `sender`/`app`에 `[notification_title]`, `[notification_app_package]` 같은 MacroDroid placeholder가 그대로 들어오는 건 별도 설정 문제다. 다만 body에는 실제 본문이 들어오므로, 결제 본문이 도착했다면 지금 구조에서도 거래 생성이 가능하다.
- Gmail `Bad Request`는 여전히 남아 있어 Gmail 영수증 기반 보강/생성은 실패한다. 하지만 이번 "폰 알림이 왔는데 즉시 등록 안 됨" 증상의 1차 원인은 `repository_dispatch` 부재 쪽이 더 강하다.

다음 확인:

1. MacroDroid 최근 실행 로그에서 GitHub `repository_dispatch` HTTP 액션이 실행됐는지, 응답 코드가 `204`였는지 확인한다.
2. MacroDroid HTTP body의 `event_type`이 정확히 `budget_ingest`인지 확인한다.
3. 결제 알림 본문 1건을 사용자가 제공하면 `workflow_dispatch mode=ingest` payload로 재현해 서버 파서 문제인지 즉시 반증한다.
4. Gmail 연동은 별도로 `npm.cmd run gmail:auth`로 refresh token 재발급 후 GitHub secret `GMAIL_REFRESH_TOKEN` 갱신이 필요할 수 있다.

## 2026-06-30 20:27 KST MacroDroid 로그 사진 확인

사용자가 MacroDroid 시스템 로그 사진을 제공했다.

관찰:

- 2026-06-30 10:38, 14:14, 14:34, 17:19의 HTTP 요청은 `response code: 200`이다.
  - 이 시간대는 Firestore 최근 raw 조회에서 배송/인증번호 등 비거래 알림으로 확인됐고, `skipped`가 맞다.
- 2026-06-30 13:29, 15:30의 HTTP 요청은 `response code: 500`이다.
  - 이 요청은 raw 저장 전에 서버 오류가 났을 가능성이 높고, 그래서 Firestore 최근 raw에 남아 있지 않다.
  - 해당 시간대 알림이 실제 결제/송금이었다면 자동 복구할 원본 raw가 서버에 없으므로, MacroDroid 로그/알림 본문으로 재전송 또는 수동 ingest 재현이 필요하다.
- 성공 코드가 `200`으로 보이는 점은 MacroDroid가 GitHub `repository_dispatch`를 직접 호출한다기보다 `/api/ingest` 계열 서버 endpoint를 호출하고 있을 가능성을 시사한다. GitHub `repository_dispatch` 직접 성공 응답은 보통 `204`다.

수정된 판단:

- 이번 증상은 두 갈래다.
  1. `200`으로 들어온 알림은 비거래라 등록되지 않은 것이 정상이다.
  2. `500`으로 실패한 알림은 서버 저장 자체가 실패했으므로, 그 알림이 결제였다면 현재 앱에 등록될 수 없다.

추가로 필요한 정보:

- 13:29 또는 15:30에 온 알림의 실제 본문.
- MacroDroid HTTP 요청 URL이 GitHub API인지 `/api/ingest`인지.
- 500 응답의 response body가 MacroDroid 로그에 남아 있으면 그 내용.

## 방금 결제 미표시 추가 대조

사용자가 "왜 방금 결제한건 안뜸"이라고 다시 물었다.

운영 Firestore를 재조회했다.

- 최신 `users/{USER_UID}/raw_messages` 20건 중 가장 최근 문서는 2026-06-30 17:19:53 KST 쿠팡 배송 완료 알림이며 `skipped`.
- 2026-06-30 17:19 KST 이후 raw 문서가 없다.
- 최신 `users/{USER_UID}/transactions` 12건 중 가장 최근 생성 거래는 2026-06-30 09:13:37 KST 생성된 2026-06-29 18:19 하나은행 대출이자 출금 건이다.
- 따라서 방금 결제 건은 앱 표시/필터 문제가 아니라 raw 저장 전 단계에서 멈춘 상태다.

현재 결론:

- 결제 알림이 MacroDroid에서 `/api/ingest` 또는 GitHub dispatch로 전송되지 않았거나, 전송됐지만 HTTP 500으로 저장 실패했을 가능성이 가장 높다.
- raw에 없기 때문에 pending 재처리나 앱 새로고침으로는 살아나지 않는다.
- 복구하려면 해당 결제 알림 본문을 받아 수동 ingest로 재전송해야 한다.

## 코드 수정 후보

- `scripts/github-sync-latest.mjs`에서 Gmail 실패나 recipes 실패가 있어도 raw 재처리 성공분은 run 전체를 실패로 끝내지 않도록 결과 정책을 분리한다.
- Gemini high demand는 재시도/backoff 또는 deterministic parser 확대가 필요하다.
- recipes job의 Firestore quota 완화 변경이 현재 워크트리에 남아 있으므로, 배포 여부를 분리 확인한다.
- 앱/설정 화면에 "마지막 sync 실패 원인"을 표시하면 사용자가 앱 문제와 수집 문제를 구분하기 쉽다.
