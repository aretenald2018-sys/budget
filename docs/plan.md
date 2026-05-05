# 구현 계획

## 완료

- [x] GitHub Pages 정적 배포 워크플로 추가
- [x] Pages artifact를 `_site`로 분리해서 API/문서/로컬 산출물 노출 방지
- [x] Vercel 배포 설정 및 Vercel용 env 동기화 스크립트 제거
- [x] MacroDroid 인입을 GitHub Actions `repository_dispatch`로 이전
- [x] Gmail 폴링과 pending raw 재처리를 GitHub Actions schedule/manual workflow로 이전
- [x] 브라우저에서 서버 API가 없는 호스트를 감지하고 local fallback으로 처리
- [x] `npm.cmd run verify`에 Pages/Actions 배포 계약 검증 추가

## 남은 선택 작업

- [ ] MacroDroid 기기에서 fine-grained GitHub token 적용
- [ ] GitHub repository secrets 등록
- [ ] 첫 GitHub Pages 배포 후 실제 로그인/선택 탭/UI 흐름 점검
