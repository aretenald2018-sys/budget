# 구현 계획

## 완료

- [x] GitHub Pages 정적 배포 워크플로 추가
- [x] Pages artifact를 `_site`로 분리해서 API/문서/로컬 산출물 노출 방지
- [x] Vercel 배포 설정 및 Vercel용 env 동기화 스크립트 제거
- [x] Gmail 영수증 폴링을 GitHub Actions schedule/manual workflow로 운영
- [x] `npm.cmd run verify`에 Pages/Actions 배포 계약 검증 추가
- [x] 기존 휴대폰 알림 수집 백엔드, 브라우저 fallback, Android bridge 코드 제거

## 남은 선택 작업

- [ ] GitHub repository secrets 등록/갱신
- [ ] 첫 GitHub Pages 배포 후 실제 로그인/UI 흐름 점검
- [ ] 새 Android 로컬 알림 수집 구현 슬라이스 진행
