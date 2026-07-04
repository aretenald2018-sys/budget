# Budget App

1인용 가계부 앱입니다. GitHub Pages가 정적 UI를 호스팅하고, GitHub Actions가 Gmail 영수증 폴링, 레시피 분석, 공개 Telegram 뉴스피드 수집, Firestore 저장과 정적 뉴스피드 snapshot 갱신을 처리합니다.

휴대폰 알림 수집은 Android APK의 알림 접근 권한 기반 로컬 수집기로 처리합니다. 결제 후보 알림은 기기 내부 큐에 저장되고, 사용자가 로그인한 앱을 열면 WebView bridge를 통해 Firestore 거래로 저장되어 캘린더/소비내역에 반영됩니다.

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
