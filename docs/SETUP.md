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
GEMINI_API_KEY
FIREBASE_SERVICE_ACCOUNT
USER_UID
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

## 3. 백엔드 작업

`.github/workflows/budget-backend.yml`는 두 경로만 운영합니다.

- `sync`: Gmail 영수증 폴링과 Firestore 저장
- `recipes`: 레시피/상품 분석

휴대폰 알림 수집은 Android APK 내부에서 동작합니다. APK 설치 후 설정 화면의 `Android 알림 수집`에서 알림 접근 설정을 열고 권한을 허용하면, 결제 후보 알림이 기기 로컬 큐에 저장됩니다. 사용자가 앱을 열어 로그인하면 큐가 Firestore 거래로 저장되어 홈/거래 캘린더에 반영됩니다.

## 4. 로컬 확인

```powershell
npm.cmd run verify
npm.cmd run pages:build
```
