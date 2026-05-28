# 거래 탭 검토 배지 안내 모달 리뷰

## 결과

- 상태: 조건부 통과
- 범위: 거래 탭 월 요약 카드의 `검토 N건 필요` 배지 클릭 안내 모달

## 확인한 것

- `render-tx.js`는 현재 월 거래 중 `needsReview` 또는 `needsPaymentRailReview()` 대상만 `STATE.reviewItems`에 저장한다.
- `검토 N건 필요` 배지는 `button`으로 렌더링되고 `window.txOpenReviewGuide()`를 통해 동적 모달을 연다.
- 모달은 거래별로 카테고리 선택, 네이버페이 실제 사용처 보완, 수입/정산 확인, 신뢰도 낮은 자동 분류 확인 중 하나의 안내를 표시한다.
- 모달 액션은 `data-tx-review-action` 위임 리스너로 처리하며 `검토 탭으로 이동`과 개별 거래 `상세` 진입을 제공한다.
- `index.html`, `app.js`, `style.css`의 cache-bust 문자열과 `styles/20-records.css` import 문자열이 함께 갱신됐다.
- repo root에 `sw.js` 또는 `STATIC_ASSETS` 정의가 검색되지 않아 `CACHE_VERSION` 갱신 대상은 없었다.

## 검증

- `node --check render-tx.js`: 통과
- `npm.cmd run verify`: 통과, `verify-project passed (96 JS files checked).`
- `git diff --check`: 통과
- 로컬 HTTP 확인: `http://127.0.0.1:5501/`, `app.js`, `render-tx.js`, `styles/20-records.css`가 HTTP 200이고 새 cache-bust 문자열을 포함했다.
- 실제 브라우저 클릭 플로우: not verified yet. in-app browser `iab`를 사용할 수 없고 Playwright 패키지도 설치되어 있지 않아 `검토 N건 필요` 탭과 모달 표시를 직접 행사하지 못했다.

## 잔여 리스크

- 실제 로그인 세션이 있는 브라우저에서 거래 탭의 `검토 N건 필요` 배지를 눌러 모달 첫 화면, 개별 `상세`, `검토 탭으로 이동`을 확인해야 한다.
- 과거 월로 이동한 상태에서 검토 탭으로 이동하면 기존 검토 탭의 60일 조회 범위와 월별 배지 기준이 다를 수 있다. 이번 요청의 첨부 화면인 현재 월 플로우에는 영향이 없다.
