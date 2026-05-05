# Project Notes

## Current Architecture

- GitHub Pages hosts the static browser app at `/budget/`.
- MacroDroid sends SMS/notification JSON to GitHub `repository_dispatch` with `event_type=budget_ingest`.
- GitHub Actions stores raw messages in `mailboxes/{sha256(INGEST_TOKEN)}/raw_messages` and `users/{USER_UID}/raw_messages`.
- GitHub Actions parses with Gemini and saves transactions under `users/{USER_UID}/transactions`.
- Browser pending raw parsing is disabled on static hosts because Gemini/API secrets must never move into browser code.

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
