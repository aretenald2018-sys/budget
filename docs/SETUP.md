# 가계부 셋업 가이드

## 1. Firebase

1. Firebase Console에서 프로젝트 생성
2. Authentication -> Email/Password 활성화
3. Firestore Database 생성
4. Authentication -> Users에서 본인 계정 생성
5. Web 앱 등록 후 `config.js`에 Firebase config 붙여넣기

Firestore Rules:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    match /mailboxes/{mailboxId}/raw_messages/{rawId} {
      allow read, update: if request.auth != null;
      allow create, delete: if false;
    }
  }
}
```

## 2. GitHub

Repository:

```text
https://github.com/aretenald2018-sys/budget
```

GitHub Pages URL:

```text
https://aretenald2018-sys.github.io/budget/
```

Required repository secrets:

```text
INGEST_TOKEN
GEMINI_API_KEY
FIREBASE_SERVICE_ACCOUNT
USER_UID
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

## 3. MacroDroid

Use GitHub `repository_dispatch`.

- URL: `https://api.github.com/repos/aretenald2018-sys/budget/dispatches`
- Method: `POST`
- Header: `Authorization: Bearer <GITHUB_FINE_GRAINED_TOKEN>`
- Header: `Accept: application/vnd.github+json`
- Body type: JSON

SMS body:

```json
{
  "event_type": "budget_ingest",
  "client_payload": {
    "source": "sms",
    "sender": "[lv=number]",
    "body": "[ltext]",
    "receivedAt": "[unix_timestamp]"
  }
}
```

Notification body:

```json
{
  "event_type": "budget_ingest",
  "client_payload": {
    "source": "notif",
    "sender": "[notification_title]",
    "body": "[notification_text]",
    "app": "[notification_app_package]",
    "receivedAt": "[unix_timestamp]"
  }
}
```

## 4. 로컬 실행

```powershell
npm.cmd run verify
npm.cmd run dev
```

URL: `http://localhost:5501/`
