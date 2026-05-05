# Budget App

1인용 가계부 앱입니다. GitHub Pages가 정적 UI를 호스팅하고, GitHub Actions가 Android MacroDroid 인입, Gmail 영수증 폴링, Gemini 파싱, Firestore 저장을 처리합니다.

## Local Start

```powershell
npm.cmd install
npm.cmd run verify
npm.cmd run dev
```

Open `http://localhost:5501`.

## Deployment

This project deploys from:

https://github.com/aretenald2018-sys/budget

The app URL is:

https://aretenald2018-sys.github.io/budget/

GitHub Pages is static hosting, so secret-backed work runs in `.github/workflows/budget-backend.yml` instead of browser code.

See `docs/deployment.md` for repository setup, required secrets, and verification flow.
