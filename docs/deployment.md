# GitHub Pages Deployment

Target repository:

```text
https://github.com/aretenald2018-sys/budget
```

Production UI:

```text
https://aretenald2018-sys.github.io/budget/
```

## Default AI Handoff

For `budgetproject`, production GitHub Pages is the default delivery target. Local `5501` is only a debug fallback, not the default handoff.

Default flow after an implementation is ready:

```powershell
npm.cmd run deploy:pages
```

`deploy:pages` builds the APK, runs `verify`, builds the Pages artifact, and pushes the current branch to `origin main`. Commit only the intended changes before running it.

Then confirm the `Deploy GitHub Pages` workflow succeeds and verify the production UI at `https://aretenald2018-sys.github.io/budget/`.

## Release Contract

- `release.json` is the single source for the browser release ID and APK artifact cache version.
- `android/apk-version.json` owns Android `versionCode` and `versionName`; its `cacheBust` must match `release.json` `cache.apk`.
- `scripts/verify/config.mjs` reads `release.json`. Do not duplicate new verifier cache constants as free-form literals.
- Source HTML, JavaScript, and CSS do not own cache query strings.
- `scripts/build-pages.mjs` stamps every local JS, CSS, webmanifest, JSON, image, and APK reference in `_site` with `release.json.releaseId`. It rejects manual source queries, unstamped artifact references, unknown top-level entries, and server/private paths.

When browser assets change, update `release.json.releaseId`; do not edit import query strings. When the APK binary changes, update Android version metadata and `release.json.cache.apk` in the same commit.

## Runtime Shape

GitHub Pages hosts only static files. It cannot run `/api/*`, keep runtime environment variables, or receive server-side POST webhooks. Secret-backed work therefore runs in GitHub Actions:

- `.github/workflows/pages.yml` deploys the static app and Android WebView wrapper APK.
- `.github/workflows/budget-backend.yml` runs Gmail receipt sync, recipe analysis, public Telegram newsfeed sync, and static Telegram feed snapshot updates.
- Browser code talks directly to Firebase for authenticated app data.

## GitHub Secrets

Add these repository secrets:

```text
GEMINI_API_KEY
FIREBASE_SERVICE_ACCOUNT
USER_UID
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

If GitHub CLI is logged in, sync them from `.env.local`:

```powershell
npm.cmd run github:secrets
```

## Scheduled Sync

`budget-backend.yml` runs Gmail receipt sync daily at `23:00 UTC` (`08:00 KST`) and can also be run manually from the Actions tab with `mode=sync`.

The recipe job can run from repository dispatch `budget_recipe_sync`, manual `mode=recipes`, or its scheduled trigger.

The Telegram newsfeed job runs public `t.me/s/<handle>` preview polling every 15 minutes and can be run manually with `mode=telegram`. It first tries to write to `users/{USER_UID}/newsfeed_items` and stores source status under `users/{USER_UID}/integrations/telegram_public_feed`. It also writes `public/newsfeed/telegram-public-feed.json`, commits that file when it changes, and dispatches `pages.yml` so the browser can fall back to a same-origin static feed if Firestore quota is exhausted. It does not need a Telegram token; Firestore persistence still needs `FIREBASE_SERVICE_ACCOUNT` and `USER_UID`.

## Verification Flow

Every push and pull request runs:

```powershell
npm.cmd run verify
```

That checks JavaScript syntax, local imports, browser/server secret boundaries, the release/cache contract, GitHub Pages/Actions config, Pages artifact allowlist, retired phone collection code absence, and delegated-event contracts.
