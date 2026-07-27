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

## Android SDK (APK 빌드 준비)

`npm run apk:build` 은 Gradle 없이 SDK 도구를 직접 호출한다. 그래서 전체 SDK 가
아니라 `build-tools` 와 `platforms/android-35` 두 패키지만 있으면 된다.

```bash
npm run android:sdk                 # ~440MB, build-tools 35.0.0 + platform 35 만 설치
export ANDROID_HOME="$HOME/.android-sdk"
npm run apk:build
npm run verify                      # APK 아티팩트 검사까지 모두 통과
```

- 설치 위치는 `ANDROID_HOME` → `ANDROID_SDK_ROOT` → `~/.android-sdk` 순으로 정해진다.
  이미 SDK 가 있는 기기라면 그 경로를 그대로 쓰고 빠진 패키지만 채운다.
- 로컬 빌드는 `.android-signing/` 에 디버그 키스토어를 자동 생성한다(gitignore 됨).
  배포용 서명 키는 GitHub Actions 시크릿에서만 온다 — 로컬 APK 는 스토어/업데이트용이 아니다.
- 에뮬레이터·시스템 이미지는 설치하지 않는다. 위젯의 **실제 렌더 확인**은 여전히
  실기기나 KVM 가능한 환경이 필요하다. 이 설정으로 검증되는 범위는 "빌드·리소스
  링크·계약이 맞는가"까지다.
- SDK 없이 검증만 돌릴 때는 `BUDGET_VERIFY_SKIP_APK_ARTIFACT=1 npm run verify`
  (`.github/workflows/validate.yml` 이 쓰는 방식).

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
TOMATO_OWNER_ID
TOMATODEV_READER_EMAIL
TOMATODEV_READER_PASSWORD
```

Daybird refresh를 실행하는 GitHub Actions와 서버 API 런타임 양쪽에 `TOMATODEV_READER_EMAIL` 및 `TOMATODEV_READER_PASSWORD`를 secret으로 설정합니다. 이 전용 Firebase Auth 계정은 `tomatodev-arete`의 필요한 원본 문서에 읽기 권한만 가져야 하며, 자격 증명이 없으면 refresh는 fail-closed 됩니다.

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
