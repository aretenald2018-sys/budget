# GitHub Pages Deployment

Target repository:

https://github.com/aretenald2018-sys/budget

Production UI:

https://aretenald2018-sys.github.io/budget/

## Runtime Shape

GitHub Pages hosts only static files. It cannot run `/api/*`, keep runtime environment variables, or receive server-side POST webhooks. Secret-backed work therefore runs in GitHub Actions:

- `.github/workflows/pages.yml` deploys the static app to GitHub Pages.
- `.github/workflows/budget-backend.yml` runs MacroDroid ingest, Gmail polling, Gemini parsing, and Firestore writes.
- Browser code talks directly to Firebase for authenticated app data and uses local fallbacks when server APIs are unavailable.

## Repository Setup

```powershell
git remote set-url origin https://github.com/aretenald2018-sys/budget.git
npm.cmd run verify
git add .
git commit -m "Migrate runtime to GitHub Pages and Actions"
git push -u origin main
```

After the first push, open the repository's Actions tab and confirm `Deploy GitHub Pages` completes. The workflow publishes `_site`, not the whole repository.

## GitHub Secrets

Add these repository secrets:

```text
INGEST_TOKEN
GEMINI_API_KEY
FIREBASE_SERVICE_ACCOUNT
USER_UID
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

## MacroDroid Ingest

Use GitHub's `repository_dispatch` endpoint instead of a Vercel webhook:

```text
POST https://api.github.com/repos/aretenald2018-sys/budget/dispatches
Authorization: Bearer <GITHUB_FINE_GRAINED_TOKEN>
Accept: application/vnd.github+json
Content-Type: application/json
```

Body:

```json
{
  "event_type": "budget_ingest",
  "client_payload": {
    "source": "notif",
    "sender": "KB",
    "app": "com.example",
    "body": "결제 메시지 본문",
    "receivedAt": "2026-05-05T12:00:00+09:00"
  }
}
```

The GitHub token should be fine-grained, limited to this repository, and allowed to create repository dispatch events.

## Scheduled Sync

`budget-backend.yml` runs daily at `23:00 UTC` (`08:00 KST`) and can also be run manually from the Actions tab with `mode=sync`.

## Verification Flow

Every push and pull request runs:

```powershell
npm.cmd run verify
```

That checks JavaScript syntax, local imports, browser/server secret boundaries, GitHub Pages/Actions config, Pages artifact creation, MacroDroid payload normalization smoke cases, and the selection tab delegated-event contract.
