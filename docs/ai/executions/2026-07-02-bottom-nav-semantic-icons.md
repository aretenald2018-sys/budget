# 하단 네비 의미형 아이콘 교체 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-bottom-nav-semantic-icons.md`
- 실행 슬라이스: `하단 네비 SVG 아이콘 교체`
- 실행 일시: 2026-07-02 KST

## 구현

- `index.html` 하단 네비 아이콘을 텍스트 기호에서 inline SVG로 교체했다.
  - `홈`: 집
  - `목표`: 타깃
  - `거래`: 카드
  - `검토`: 체크리스트
- SVG는 `currentColor` 기반으로 기존 active/inactive 색상 시스템을 그대로 사용한다.
- `styles/00-foundation.css`에 하단 네비 SVG 크기와 stroke 스타일을 추가했다.
- CSS cache bust를 `20260702-bottom-nav-icons`로 갱신했다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 문자열 확인
  - `20260702-bottom-nav-icons` 반영 확인.
  - 하단 네비 inline SVG 4개 반영 확인.
  - `.bottom-nav button .icon svg` CSS 반영 확인.

## 남은 확인

- GitHub Pages 배포 후 운영 URL에서 하단 네비 아이콘을 직접 확인한다.
