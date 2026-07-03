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

`deploy:pages` runs `verify`, builds the Pages artifact, and pushes the current branch to `origin main`. Commit only the intended changes before running it.

Then confirm the `Deploy GitHub Pages` workflow succeeds and verify the production UI at `https://aretenald2018-sys.github.io/budget/`.

## Runtime Shape

GitHub Pages hosts only static files. It cannot run `/api/*`, keep runtime environment variables, or receive server-side POST webhooks. Secret-backed work therefore runs in GitHub Actions:

- `.github/workflows/pages.yml` deploys the static app and Android WebView wrapper APK.
- `.github/workflows/budget-backend.yml` runs Gmail receipt sync and recipe analysis.
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

## Verification Flow

Every push and pull request runs:

```powershell
npm.cmd run verify
```

That checks JavaScript syntax, local imports, browser/server secret boundaries, GitHub Pages/Actions config, Pages artifact creation, retired phone collection code absence, and the selection tab delegated-event contract.
