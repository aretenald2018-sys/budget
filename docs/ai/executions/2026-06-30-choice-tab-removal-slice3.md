# 선택 탭 제거 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-06-30-consumption-cleanup-choice-removal-naverpay.md`
- 실행 슬라이스: 슬라이스 3 - 선택 탭 및 직접 관련 기능/UI 제거
- 실행일: 2026-06-30 KST

## 변경 요약

- `app.js`에서 `cart` 탭, `renderCart`, 선택 공유 진입, pact reminder를 제거했다.
- `index.html`에서 `#tab-cart` 섹션과 하단 `선택` 버튼을 제거하고 CSS/JS/manifest cache bust를 갱신했다.
- PWA `share_target`과 Android `ACTION_SEND` 공유 타깃을 제거했다.
- 홈/감각뱅크/끌림/목표/설정에서 선택 탭으로 이어지던 UI와 이동 함수를 제거하거나 `mindbank` fallback으로 바꿨다.
- Pages artifact에서 `render-cart.js`와 `choice/`를 복사하지 않게 했다.
- 선택 탭 전용 렌더러/CSS 파일 `render-cart.js`, `styles/30-cart-board.css`, `styles/40-cart-choice.css`, `styles/80-responsive.css`를 삭제했다.
- `styles/20-records.css`, `styles/50-cart-detail.css`, `styles/60-urge.css`, `styles/70-reports.css`의 선택 탭 잔여 CSS를 정리했다.
- `scripts/verify-project.mjs`를 선택 탭 존재 강제에서 선택 탭 부재 검증으로 변경했다.

## 검증

- 실행: `npm.cmd run verify`
- 결과: 통과 (`verify-project passed (94 JS files checked).`)
- 추가 검색: 앱/스타일 코드에서 `#tab-cart`, `data-tab="cart"`, `switchTab('cart')`, `shareTarget=cart`, `renderCart`, `render-cart.js` 진입점이 제거됨을 확인했다. 남은 문자열은 검증 스크립트의 금지 토큰과 `AGENTS.md` 안내뿐이다.

## 미검증

- 실제 브라우저 UI 플로우는 아직 not verified yet. 프로젝트 규칙상 Codex sandbox 장기 dev server를 검증 완료로 주장하지 않으며, 정상 터미널에서 dev server를 띄운 뒤 확인해야 한다.

## 리뷰 포인트

- `choice/` 모듈은 레거시 레시피 검증/API 참조 때문에 저장소에는 남겼고, Pages 복사 대상에서는 제외했다.
- Firestore의 `cart_items`, `cart_categories`, `pacts`, `mindbank` 데이터와 네이버페이/토스 로직은 이번 슬라이스에서 변경하지 않았다.
