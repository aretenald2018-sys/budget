# 홈/거래 상단 불필요 UI 및 보조 금액 폰트 회귀 진단

## 증상

- 홈 첫 화면에서 기간 이동 카드가 여전히 보인다.
- 홈 `관리 카테고리` 카드 섹션이 여전히 보인다.
- 거래 탭 월간 hero에서 `자동 분류 정상` 배지가 여전히 보인다.
- 홈 hero 보조 지표 `고정비 제외 조절비`의 금액 줄이 모바일에서 어색하게 보인다.

## 확인한 원인

- `render-report.js`가 홈 모드에서도 `.report-month-nav.home-cycle-nav`를 항상 렌더링한다.
- `render-report.js`가 홈 모드에서 `home-managed-section`을 렌더링한다.
- `render-tx.js`가 검토 대상이 없을 때 `<div class="pace">● 자동 분류 정상</div>`을 렌더링한다.
- `styles/60-urge.css`의 `.report-hero-secondary-head`는 `flex-wrap` 구조라 좁은 폭에서 라벨과 금액의 줄 배치가 불안정하다.

## 범위

- 홈/거래 UI에서 위 요소를 렌더링하지 않게 한다.
- `고정비 제외 조절비` 보조 금액은 라벨과 금액을 명확히 분리하고 금액 안에서는 줄바꿈하지 않게 한다.
- 데이터 집계, 카테고리 설정, Firestore schema는 변경하지 않는다.
