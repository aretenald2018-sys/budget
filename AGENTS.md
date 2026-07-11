# Project Notes

## Working Style

- Implement directly by default. Create a plan only when the user requests one, the scope is materially ambiguous, or the change spans several independent modules.
- Diagnose before editing only when the bug cannot be reproduced or its cause is uncertain.
- Read feature documentation only when it is relevant to the requested change.

## Current Architecture

- GitHub Pages hosts the static browser app at `/budget/`.
- GitHub Actions handles Gmail receipt polling and recipe analysis only.
- Phone notification collection is being rebuilt from scratch per `docs/adr/2026-07-03-android-local-notification-ingest.md`.
- Historical `users/{USER_UID}/raw_messages` data may remain for review, but no current backend writes or parses phone raw messages.
- Gemini/API secrets must never move into browser code.

## Deployment Default

- For this `budgetproject`, the default delivery target is production GitHub Pages, not a local `5501` dev server.
- Production UI: `https://aretenald2018-sys.github.io/budget/`.
- After an implementation/review slice is complete, verify with `npm.cmd run verify` and `npm.cmd run pages:build`, then deploy by pushing the intended committed changes to `main` so `.github/workflows/pages.yml` publishes GitHub Pages. If the intended changes are already committed, `npm.cmd run deploy:pages` performs this default production path.
- Do not present `npm.cmd run dev`, `python -m http.server 5501`, `localhost:5501`, or `127.0.0.1:5501` as the default final handoff for this project. Mention local dev server only as an optional debug fallback when production deployment or production UI verification is blocked.
- Final handoff must name changed files and verification performed. Include the production URL, workflow status, and UI state when the requested work includes deployment or production UI verification.
- If production deploy cannot be performed safely because the worktree has unrelated dirty changes, missing credentials, or no commit/push permission, say `not verified yet` and name that exact blocker instead of falling back to `5501` as if it were the target.

## Rules

1. Do not delete raw messages. Change status only.
2. Do not put Gemini API keys or server secrets in browser code or localStorage.
3. Required GitHub Actions secrets: `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`.
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

- `api/sync-latest.js` — authenticated Gmail receipt sync endpoint
- `scripts/github-sync-latest.mjs` — GitHub Actions Gmail receipt sync runner
- `data.js` — Firestore data boundary (browser)
- `api/gmail-poll.js` — Gmail receipt polling endpoint
- `api/_lib/gmail.js` — Gmail OAuth2 + REST API helpers
- `api/_lib/receipt-parser.js` — Gemini email → structured receipt parser
- `api/_lib/receipt-enricher.js` — receipt match/enrich/create transaction logic
- `firestore.indexes.json` — composite index: transactions(amount, occurredAt)
