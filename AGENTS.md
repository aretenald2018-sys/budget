# Project Notes

## Default AI Workflow (Required)

- For any request that may change code, docs, data, config, tests, deployment, or UX, follow `docs/ai/WORKFLOW.md` by default.
- The required order is: planning session -> execution session -> review session.
- AI가 생성하는 계획, 리뷰, ADR, 로드맵, 핸드오프 문서는 기본적으로 한국어로 작성한다. 코드 식별자, 파일 경로, 명령어, API 이름, 라이브러리 이름, 인용 원문은 원래 언어를 유지한다.
- 기본 트리거: 기능, 디자인, UX, 아키텍처, 모호한 변경 요청에는 `/grill-me`를 자동 적용한다. 버그, 오류, 실패, 회귀, UI 깨짐, 성능 문제에는 `/diagnose`를 자동 적용한다. 둘 다 해당될 수 있으면 `/diagnose`를 먼저 적용한다.
- 자동 진행: 세션 시작 시 `docs/ai/NEXT_ACTION.md`를 먼저 확인한다. 대기 중인 다음 단계가 있고 사용자의 새 요청과 충돌하지 않으면 다음/리뷰 프롬프트를 사용자에게 요구하지 말고 그 단계로 바로 진행한다. 각 단계 종료 시 이 파일을 갱신한다.
- If the user asks to "just implement", "fix", "build", or "change" something without naming an approved `docs/ai/features/*.md` plan, create or update the plan first and do not edit app code yet.
- In a planning session, only edit `docs/ai/` or `docs/adr/` unless the user explicitly identifies an approved plan and asks for a specific execution slice.
- In an execution session, implement exactly one approved slice from the plan. Do not combine adjacent features or opportunistic refactors.
- In a review session, review against the plan and changed files. Do not add new feature work during review.
- Durable handoff matters more than chat memory: every substantial request must leave a plan, review, or ADR document that a fresh session can read.

## Current Architecture

- GitHub Pages hosts the static browser app at `/budget/`.
- MacroDroid sends SMS/notification JSON to GitHub `repository_dispatch` with `event_type=budget_ingest`.
- GitHub Actions stores raw messages in `mailboxes/{sha256(INGEST_TOKEN)}/raw_messages` and `users/{USER_UID}/raw_messages`.
- GitHub Actions parses with Gemini and saves transactions under `users/{USER_UID}/transactions`.
- Browser pending raw parsing is disabled on static hosts because Gemini/API secrets must never move into browser code.

## Deployment Default

- For this `budgetproject`, the default delivery target is production GitHub Pages, not a local `5501` dev server.
- Production UI: `https://aretenald2018-sys.github.io/budget/`.
- After an implementation/review slice is complete, verify with `npm.cmd run verify` and `npm.cmd run pages:build`, then deploy by pushing the intended committed changes to `main` so `.github/workflows/pages.yml` publishes GitHub Pages. If the intended changes are already committed, `npm.cmd run deploy:pages` performs this default production path.
- Do not present `npm.cmd run dev`, `python -m http.server 5501`, `localhost:5501`, or `127.0.0.1:5501` as the default final handoff for this project. Mention local dev server only as an optional debug fallback when production deployment or production UI verification is blocked.
- Final handoff should name the production URL, the GitHub Pages workflow/run status to check, and the production UI state that proves the change works.
- If production deploy cannot be performed safely because the worktree has unrelated dirty changes, missing credentials, or no commit/push permission, say `not verified yet` and name that exact blocker instead of falling back to `5501` as if it were the target.

## Rules

1. Do not delete raw messages. Change status only.
2. Do not put Gemini API keys or INGEST_TOKEN in browser code or localStorage.
3. Required GitHub Actions secrets: `INGEST_TOKEN`, `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`.
4. Gmail receipt pipeline additionally requires: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.
5. New Firestore reads/writes should go through `data.js` (browser) or `firebase-admin.js` (server).
6. Functions referenced from inline HTML handlers must be exposed on `window`.
7. Dynamically generated selection buttons must use `type="button"` plus `data-*` attributes and `addEventListener`/delegated listeners. Do not interpolate quoted string arguments into inline `onclick` attributes; verify that clicking a result actually fills the intended fields.

## UI Implementation Rules

1. Implement against the real app entrypoint at `/`, not only a mockup file. Mockups are references, not proof of implementation.
2. Before changing a modal or sheet, confirm where it is mounted. Modals in `#modals-container` are outside tab containers like `#tab-cart`, so tab-scoped CSS selectors will not apply to them.
3. For frontend changes, update cache-busting query strings in `index.html` and any importing module such as `app.js` when edited CSS/JS must be reloaded by the browser.
4. Do not call a UI change complete based only on `node --check`, build success, or HTTP 200. Actual verification requires opening the real app screen, exercising the user flow, and checking the visible state.
5. If browser/UI verification is unavailable, say `not verified yet` and name the exact missing check. Do not imply the implementation is visually verified.
6. For selection tab/detail modal work, verify at minimum: selected segment, modal first viewport, image sizing, condition editor collapsed/expanded states, save path, and no unstyled native controls leaking into the sheet.

## Important Files

- `api/ingest.js` — unified MacroDroid webhook
- `api/_lib/auto-ingest.js` — raw save and immediate transaction creation
- `api/client-config.js` — fallback mailbox id endpoint
- `api/client-parse.js` — fallback Gemini parsing proxy
- `client-parse.js` — browser fallback raw processing
- `render-settings.js` — manual fallback parse controls
- `data.js` — Firestore data boundary (browser)
- `api/gmail-poll.js` — Gmail receipt polling endpoint (cron or MacroDroid trigger)
- `api/_lib/gmail.js` — Gmail OAuth2 + REST API helpers
- `api/_lib/receipt-parser.js` — Gemini email → structured receipt parser
- `api/_lib/receipt-enricher.js` — receipt match/enrich/create transaction logic
- `firestore.indexes.json` — composite index: transactions(amount, occurredAt)
