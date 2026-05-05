# PRD

## 목표

MacroDroid 설정은 단순하게 유지하고, Gemini API key는 브라우저에 노출하지 않는 개인용 가계부.

## 핵심 흐름

1. MacroDroid가 SMS/알림을 GitHub `repository_dispatch`로 전송
2. GitHub Actions가 payload를 정규화하고 raw를 Firestore mailbox와 사용자 raw에 저장
3. GitHub Actions가 Gemini로 파싱
4. GitHub Actions가 `users/{uid}/transactions`에 거래 저장
5. GitHub Pages 웹앱은 거래를 조회하고 사용자가 직접 보정

## 필수 기능

| 기능 | 설명 |
|------|------|
| Raw 인입 | SMS/알림 원문 저장 |
| 서버 파싱 | GitHub Actions secrets의 Gemini API key 사용 |
| 거래 저장 | Firebase Admin SDK가 사용자 스코프에 저장 |
| 리뷰 큐 | 낮은 confidence 거래 보정 |
| 설정 | 계좌, 카테고리, 앱 설정 |
