# 가계부 기술 아키텍처

## 구조

```text
GitHub Pages SPA
  -> Firebase Auth + Firestore client SDK
  -> users/{uid}/transactions, receipts, settings

GitHub Actions schedule/manual sync
  -> Gmail receipt polling
  -> Gemini receipt parsing
  -> Firestore receipts/transactions

GitHub Actions recipe job
  -> recipe video/item analysis
  -> Firestore recipe/product data
```

## 역할 분리

| 영역 | 역할 |
|------|------|
| GitHub Pages | 정적 앱 호스팅 |
| Browser SPA | 로그인, 조회, 편집, 직접 Firestore CRUD |
| GitHub Actions sync | Gmail 영수증 폴링과 거래/영수증 저장 |
| GitHub Actions recipes | 레시피 분석과 상품 데이터 저장 |
| `users/{uid}` | 실제 거래, 영수증, 계좌, 카테고리 저장 |

## 서버 Secrets

GitHub Actions 기본 secrets:

```text
GEMINI_API_KEY
FIREBASE_SERVICE_ACCOUNT
USER_UID
```

Gmail 영수증 파이프라인 추가 secrets:

```text
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

휴대폰 알림 수집은 `docs/adr/2026-07-03-android-local-notification-ingest.md` 기준의 Android 로컬 수집 경로를 사용합니다. APK의 `NotificationListenerService`가 결제 후보 알림을 로컬 큐에 저장하고, 로그인된 WebView가 `window.BudgetAndroid` bridge로 큐를 읽어 `data.js`의 거래 저장 경로에 연결합니다. 서버 알림 ingest, 브라우저 raw parser, token/API URL 저장 경로는 사용하지 않습니다.

## 검증 구조

- `npm.cmd test`: `test/fixtures/`의 금융·영수증·Android payload 계약을 Node 내장 test runner로 검증합니다.
- `npm.cmd run verify`: `scripts/verify/checks/`의 정적 파일, 배포, Android, 도메인 계약 검사를 실행합니다.
- `npm.cmd run pages:build`: allowlist 기반 GitHub Pages artifact를 `_site`에 만듭니다.
- 사용자 화면을 변경한 작업은 `docs/refactor-smoke-matrix.md`의 production 흐름도 실제로 조작해야 완료입니다.

`scripts/verify-project.mjs`는 검사 실행 순서와 결과 집계만 담당합니다. 공통 경로/실패
수집은 `scripts/verify/runtime.mjs`, 현재 배포/cache 계약은
`scripts/verify/config.mjs`가 소유합니다.
