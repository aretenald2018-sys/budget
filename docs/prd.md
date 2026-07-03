# PRD

## 목표

브라우저에는 서버 secrets를 노출하지 않고, GitHub Pages 정적 앱과 GitHub Actions 백엔드를 분리한 개인용 가계부를 운영한다.

## 현재 핵심 흐름

1. GitHub Pages 웹앱이 Firebase Auth로 로그인한다.
2. 사용자가 거래/계좌/카테고리/설정을 Firestore에 저장한다.
3. GitHub Actions가 Gmail 영수증을 폴링한다.
4. 서버 측 Gemini 파서가 영수증을 구조화한다.
5. GitHub Actions가 `users/{uid}` 아래 영수증과 거래를 저장하거나 보강한다.

## 필수 기능

| 기능 | 설명 |
|------|------|
| 거래 관리 | 사용자가 거래를 조회, 입력, 편집 |
| 영수증 동기화 | Gmail 영수증을 서버 secrets 기반으로 수집/파싱 |
| 거래 저장 | Firebase Admin SDK가 사용자 스코프에 저장 |
| 리뷰 큐 | 낮은 confidence 거래와 미매칭 영수증 보정 |
| 설정 | 계좌, 카테고리, 앱 설정 |

## 다음 제품 방향

휴대폰 알림 수집은 Android 알림 접근 권한 기반 로컬 수집 구조로 운영한다. 기준 문서는 `docs/adr/2026-07-03-android-local-notification-ingest.md`이며, 결제 후보 알림은 APK 로컬 큐에 먼저 저장된 뒤 로그인된 앱이 열릴 때 거래 캘린더/소비내역에 반영된다.
