# 리팩토링 미사용 코드 정리 리뷰 - 슬라이스 2

## 범위

- 계획 문서: `docs/ai/features/2026-05-31-refactor-unused-code-efficiency.md`
- 실행 슬라이스: 슬라이스 2 - 선택 탭 미사용 렌더/CSS 정리
- 변경 파일: `render-cart.js`, `app.js`, `index.html`, `style.css`, `styles/20-records.css`, `styles/30-cart-board.css`, `styles/40-cart-choice.css`, `styles/50-cart-detail.css`, `styles/80-responsive.css`

## 리뷰 결과

- 차단 이슈 없음.
- 현재 선택 탭은 `choiceProductCard()`/`choiceTodayFeed()` 계열을 사용하므로, 옛 `buySegmentHtml()`와 그 하위 helper는 실제 호출 경로가 없었다.
- 옛 단품 카드, 레시피 카드, 주문처 시트, 카테고리 관리자 경로를 제거했고 관련 import와 이벤트 핸들러도 같이 제거했다.
- `.cart-decision-hero` 및 제거된 옛 렌더 경로의 CSS selector를 정리했다.
- 수정된 JS/CSS를 브라우저가 다시 받도록 `index.html`, `app.js`, `style.css`의 cache-busting query string을 갱신했다.
- repo root에 `sw.js`/`STATIC_ASSETS`/`CACHE_VERSION`가 없어 서비스워커 cache bump 대상은 없었다.

## 검증

- `node --check render-cart.js`: 통과
- `node --check app.js`: 통과
- `node --check scripts/build-pages.mjs`: 통과
- CSS brace balance smoke: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- 제거 대상 재검색: `buySegmentHtml`, `.cart-decision-hero`, 옛 `cart-simple*`, `cart-recipe*`, `cart-source*` selector/handler 검색 결과 없음

## 남은 리스크

- 실제 브라우저 선택 탭 조작 검증은 아직 수행하지 않았다. 프로젝트 규칙상 sandbox에서 장기 dev server를 시작해 검증 완료로 주장하지 않는다.
- 사용자가 일반 터미널에서 `npm.cmd run dev`를 실행한 뒤 `http://localhost:5501/`에서 선택 탭, 카드 액션 시트, 상세 모달, 레시피 재료 체크, 저장 경로를 확인해야 한다.
