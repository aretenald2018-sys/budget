# 선택 탭 제거 슬라이스 3 리뷰

## 결론

배포 전 차단 이슈 없음.

## 검토 범위

- 계획: `docs/ai/features/2026-06-30-consumption-cleanup-choice-removal-naverpay.md`
- 실행 기록: `docs/ai/executions/2026-06-30-choice-tab-removal-slice3.md`
- 주요 변경: 선택 탭 진입점 제거, 선택 공유 타깃 제거, Pages 복사 대상 제거, 전용 CSS/렌더러 삭제, 검증 규칙 갱신

## 확인 결과

- `TABS`, `TAB_RENDERERS`, 하단 nav, `#tab-cart`, PWA `share_target`, Android `ACTION_SEND`에서 선택 탭 진입이 제거됐다.
- 홈/목표/감각뱅크/끌림/설정에서 `switchTab('cart')`로 이동하던 UI와 함수가 제거되거나 `mindbank` fallback으로 바뀌었다.
- `render-cart.js` 및 선택 전용 CSS 파일은 삭제됐고, `scripts/build-pages.mjs`는 `render-cart.js`와 `choice/`를 Pages artifact에 복사하지 않는다.
- `scripts/verify-project.mjs`는 선택 탭 존재를 강제하지 않고, 주요 선택 탭 진입 문자열이 앱 코드에 재도입되면 실패하도록 바뀌었다.
- Firestore 데이터 삭제, 네이버페이 보강, 토스 김태우 제외, 거래 탭 명칭 변경은 이번 슬라이스에 섞이지 않았다.

## 검증

- `npm.cmd run verify` 통과.
- 배포 후 GitHub Pages workflow가 동일하게 `npm run verify`와 `npm run pages:build`를 실행한다.

## 남은 리스크

- 실제 브라우저 UI 플로우는 로컬 정상 터미널 또는 배포된 Pages에서 직접 확인해야 한다. 배포 후 확인 기준은 하단 nav에 `선택`이 없고, `?shareTarget=cart` 접속이 홈으로 안전하게 돌아오는 것이다.
