# 가계부 기술 아키텍처

## 구조

```
Android MacroDroid
  -> GitHub repository_dispatch(event_type=budget_ingest)
  -> GitHub Actions budget-backend.yml
  -> Firestore mailboxes/{sha256(INGEST_TOKEN)}/raw_messages
  -> Gemini server-side call
  -> users/{uid}/transactions

GitHub Actions schedule/manual sync
  -> Gmail receipt polling
  -> pending raw 재처리
  -> Firestore transactions

GitHub Pages SPA
  -> Firebase Auth + Firestore client SDK
  -> static-host fallback for AI/API-only helpers
```

## 역할 분리

| 영역 | 역할 |
|------|------|
| GitHub Pages | 정적 앱 호스팅 |
| GitHub Actions `budget_ingest` | MacroDroid payload 저장, Gemini 파싱, 거래 저장 |
| GitHub Actions `budget_sync`/schedule | Gmail 영수증 폴링, pending raw 재처리 |
| Firestore mailbox | 파싱 전 원문 우편함 |
| Browser SPA | 로그인, 조회, 편집, 직접 Firestore CRUD |
| users/{uid} | 실제 거래, 계좌, 카테고리 저장 |

## 서버 Secrets

GitHub Actions에는 `INGEST_TOKEN`, `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`가 필요합니다.

Gmail 영수증 파이프라인에는 추가로 `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`이 필요합니다.
