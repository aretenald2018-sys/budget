# 하단 네비 의미형 아이콘 교체 계획

## 요청

- 하단 네비의 `홈`, `목표`, `거래`, `검토` 아이콘이 현재 추상 기호라 내용과 잘 맞지 않으므로 더 직관적인 아이콘으로 교체한다.

## 결정

- 탭 구조, 라벨, 라우팅은 변경하지 않는다.
- 기존 텍스트 기호 대신 inline SVG를 사용한다.
- 의미 매핑:
  - `홈`: 집
  - `목표`: 타깃
  - `거래`: 카드
  - `검토`: 체크리스트
- SVG는 `currentColor`를 사용해 기존 active/inactive 색상 시스템을 그대로 따른다.
- CSS cache bust는 `20260702-bottom-nav-icons`로 갱신한다.

## 실행 슬라이스

- 수정 파일: `index.html`, `styles/00-foundation.css`, `style.css`, 문서.
- 검증:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - `_site` 산출물에서 SVG 아이콘과 cache bust 확인
  - 운영 GitHub Pages 배포 후 하단 네비 아이콘 확인
