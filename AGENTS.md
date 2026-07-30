# budgetproject

Global tool, environment, and worktree/branch rules live in `~/.claude/CLAUDE.md`.

## Working style

- Implement directly by default. Plan only when the user asks, the scope is materially ambiguous, or the change spans several independent modules.
- Diagnose before editing only when the bug cannot be reproduced or its cause is uncertain.
- Read feature documentation only when it is relevant to the requested change.

## Architecture

- GitHub Pages hosts the static browser app at `/budget/`.
- GitHub Actions handles Gmail receipt polling and recipe analysis only.
- Phone notification collection is being rebuilt per `docs/adr/2026-07-03-android-local-notification-ingest.md`. Historical `users/{USER_UID}/raw_messages` may remain for review; no current backend writes or parses them.

## Deployment default

- The delivery target is production GitHub Pages (`https://aretenald2018-sys.github.io/budget/`), not a local `5501` dev server.
- After a slice: `npm.cmd run verify` → `npm.cmd run pages:build` → push the intended commits to `main` so `.github/workflows/pages.yml` publishes. If already committed, `npm.cmd run deploy:pages` does this.
- Never present `npm.cmd run dev`, `python -m http.server 5501`, or `localhost:5501` as the final handoff — only as an optional debug fallback when production verification is blocked.
- Include the production URL, workflow status, and UI state whenever the work included deployment or production UI verification.

## Rules

1. Do not delete raw messages. Change status only.
2. Never put Gemini API keys or server secrets in browser code or localStorage.
3. Required GitHub Actions secrets: `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`. Gmail receipts additionally need `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.
4. New Firestore reads/writes go through `data.js` (browser) or `firebase-admin.js` (server).
5. Functions referenced from inline HTML handlers must be exposed on `window`.
6. Dynamically generated selection buttons use `type="button"` plus `data-*` attributes and `addEventListener`/delegated listeners. Do not interpolate quoted string arguments into inline `onclick`; verify that clicking a result actually fills the intended fields.

## UI rules

1. Implement against the real app entrypoint at `/`, not only a mockup file. Mockups are references, not proof.
2. Before changing a modal or sheet, confirm where it is mounted. Modals in `#modals-container` sit outside tab containers like `#tab-cart`, so tab-scoped CSS selectors will not apply.
3. Update cache-busting query strings in `index.html` and any importing module such as `app.js` when edited CSS/JS must be reloaded.
4. For selection tab / detail modal work, verify at minimum: selected segment, modal first viewport, image sizing, condition editor collapsed and expanded states, save path, and no unstyled native controls leaking into the sheet.

## Android APK / 위젯

- APK 빌드에는 Android SDK가 필요하다. 없으면 `npm run android:sdk`로 build-tools와 platform만 설치하고 `ANDROID_HOME`을 export한다(약 440MB, 에뮬레이터 제외).
- 위젯(`android/src/.../RewardWidget*.java`, `android/res/layout/reward_widget.xml`)을 건드렸으면 `npm run apk:build`로 컴파일까지 확인한다. 소스 토큰 계약(`scripts/verify/checks/android-checks.mjs`) 통과만으로는 빌드 성공을 보장하지 못한다.
- 이 저장소에 에뮬레이터를 설치하지 않는다. 위젯 실제 렌더는 실기기 확인이 필요하므로 렌더를 보지 않았다면 `not verified yet`이라고 쓴다.

## Important files

- `api/sync-latest.js` — authenticated Gmail receipt sync endpoint
- `scripts/github-sync-latest.mjs` — GitHub Actions Gmail receipt sync runner
- `api/gmail-poll.js` — Gmail receipt polling endpoint
- `api/_lib/gmail.js` — Gmail OAuth2 + REST helpers
- `api/_lib/receipt-parser.js` — Gemini email → structured receipt parser
- `api/_lib/receipt-enricher.js` — receipt match/enrich/create transaction logic
- `data.js` — Firestore data boundary (browser)
- `firestore.indexes.json` — composite index: transactions(amount, occurredAt)
