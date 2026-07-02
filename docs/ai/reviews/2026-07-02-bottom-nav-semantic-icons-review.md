# 하단 네비 의미형 아이콘 교체 리뷰

## 리뷰 결과

- 큰 결함 없음.

## 확인한 점

- 탭 라벨과 `data-tab` 값은 변경하지 않았다.
- SVG는 `aria-hidden="true"`와 `focusable="false"`를 사용해 텍스트 라벨 접근성을 유지한다.
- `type="button"`을 추가해 네비 버튼이 폼 제출 버튼처럼 동작할 여지를 줄였다.
- CSS 변경은 하단 네비 `.icon svg`로 스코프되어 다른 `.icon` 사용처에 영향이 작다.

## 검증

- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- `_site` 산출물에서 새 SVG 아이콘과 cache bust 확인.

## 운영 확인

- GitHub Pages workflow `28586475031` 성공.
- 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 새 cache bust `20260702-bottom-nav-icons` 로드 확인.
- 운영 HTTP 확인: `/budget/`, `styles/00-foundation.css?v=20260702-bottom-nav-icons` 모두 `200`.
- 운영 UI에서 하단 네비 4개가 의미형 SVG 아이콘으로 보이는 것을 확인했다.

## 잔여 리스크

- 없음.
