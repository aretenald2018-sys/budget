# 홈 CSS 회귀 진단

## 증상

- 사용자 스크린샷 기준 홈 최상단 흰 카드가 세로로 무너져 보인다.
  - 왼쪽/오른쪽 이동 버튼이 같은 줄에 있지 않고, 카드 안 여백이 과도하게 커졌다.
- `이번 달 고정비` 카드 안 텍스트가 삭제 전 디자인보다 크고 덜 정돈되어 보인다.
- 요청 기준은 `Remove choice tab` 직전 디자인이다.

## 재현/피드백 루프

- 기준 커밋:
  - 현재 HEAD: `5ecc980 Clean up home header visuals`
  - 탭 삭제 커밋: `4d0e02f Remove choice tab`
  - 탭 삭제 이전 기준: `e9e370f Document subcategory confirm deployment`
- 비교 방법:
  - 현재 `styles/60-urge.css`, `styles/50-cart-detail.css`, `style.css`
  - `e9e370f`의 `styles/30-cart-board.css`, `styles/40-cart-choice.css`, `styles/60-urge.css`

## 가설

1. `.report-month-nav`가 `display:flex`/`align-items`/`justify-content`를 잃어 홈 상단 흰 카드가 세로 배치로 깨졌다.
2. `Remove choice tab`에서 `styles/30-cart-board.css`/`styles/40-cart-choice.css` import가 제거되며, 고정비 상세 행의 grid/폰트 규칙이 같이 사라졌다.
3. 직전 홈 시각 정리 커밋에서 hero 토글 값을 수정해 탭 삭제 전 디자인과 차이가 생겼다.
4. `index.html`의 status bar 제거는 별개이며 이번 증상 원인은 아니다.

## 확인 결과

- `e9e370f:styles/30-cart-board.css`에는 `.report-month-nav { display:flex; align-items:center; gap:8px; }`와 `.report-month-nav .t6 { flex:1; text-align:center; }`가 있었다.
- `e9e370f:styles/40-cart-choice.css`에는 `.report-month-nav { display:flex; align-items:center; justify-content:space-between; min-height:42px; ... }`와 `.report-month-nav.home-cycle-nav` 전용 규칙이 있었다.
- 현재 `styles/60-urge.css`의 `.report-month-nav`는 border/background/padding만 있고 `display:flex`가 없다.
- `e9e370f:styles/30-cart-board.css`에는 `.fixed-cost-summary`, `.fixed-cost-row`, `.fixed-cost-row span/strong/em` 전체 규칙이 있었다.
- 현재 `styles/60-urge.css`에는 `.fixed-cost-summary strong`과 `.fixed-cost-row strong` 일부만 있어 행 레이아웃과 폰트 크기가 삭제 전과 다르다.

## 진단 결론

- 홈 상단 흰 카드와 고정비 폰트 문제는 탭 삭제 시 제거된 CSS import의 부작용이다.
- 수정은 앱 로직이 아니라 `styles/60-urge.css`에 삭제 전 선택자 규칙을 필요한 범위만 복구하는 방식이 적합하다.
- 직전 커밋에서 바꾼 홈 hero 토글 값도 사용자의 최신 요청에 맞춰 `e9e370f` 값으로 되돌린다.
