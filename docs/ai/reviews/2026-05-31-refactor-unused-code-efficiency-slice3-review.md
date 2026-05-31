# 리팩토링 미사용 코드 정리 리뷰 - 슬라이스 3

## 범위

- 계획 문서: `docs/ai/features/2026-05-31-refactor-unused-code-efficiency.md`
- 실행 슬라이스: 슬라이스 3 - 배포 복사/검증 규칙 보강
- 변경 파일: `scripts/verify-project.mjs`

## 리뷰 결과

- 발견 사항 없음.
- `match.js`, `parse.js`가 repository root에 다시 생기면 검증 실패하도록 했다.
- `scripts/build-pages.mjs`가 retired root file을 다시 Pages artifact에 복사하려 하면 검증 실패하도록 했다.
- 선택 탭에서 제거한 옛 렌더 helper와 CSS selector 일부가 `render-cart.js` 또는 선택 탭 관련 CSS 모듈에 재도입되면 검증 실패하도록 했다.

## 검증

- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)

## 남은 리스크

- 실제 브라우저 선택 탭 조작 검증은 아직 수행하지 않았다. 프로젝트 규칙상 sandbox에서 장기 dev server를 시작해 검증 완료로 주장하지 않는다.
