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

- 배포 후 갱신 예정.

## 잔여 리스크

- 운영 UI에서 실제 아이콘 크기/간격을 확인해야 한다.
