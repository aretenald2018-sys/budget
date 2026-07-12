# 앱 전체 리팩토링 리뷰 - 슬라이스 1

## 범위

- 계획: `docs/ai/features/2026-07-12-appwide-refactor-plan.md`
- 슬라이스: 미사용 표면과 배포 산출물 정리
- 구현 커밋: `5fae61f`, `3c7ce6e`

## 변경 결과

- 제거된 선택 탭 전용 `choice/` UI 모듈 12개를 삭제했다.
- 계속 사용하는 recipe 검증 코드는 `shared/recipe/`, 서버 이미지 검색은
  `api/_lib/public-visual-search.js`로 이동했다.
- GitHub recipe 작업이 사용하는 Firestore `cart_items` 데이터는 보존했다.
- 브라우저에서 참조되지 않는 cart CRUD와 normalization 191줄을 `data.js`에서 제거했다.
- cart 전용 CSS와 pact 편집 잔여 CSS를 제거하고
  `styles/50-cart-detail.css`를 실제 역할에 맞는 `styles/50-app-flows.css`로 바꿨다.
- production 검사 중 호출부가 없는 `itemList()`/`financeItemRow()`와 전용 CSS 72줄을
  추가로 발견해 제거했다.
- `choice/`, 브라우저 cart API, cart CSS class, 이전 CSS 파일과 cache contract가
  재도입되면 verify가 실패하도록 했다.

## 보존 판단

- `pacts`는 욕구 흐름의 `savePact()`가 사용하므로 유지했다.
- `cart_items`는 `github-recipe-sync`, recipe analysis, 배포 recipe 검증이 사용하므로
  collection과 서버 작업을 유지했다.
- raw message와 기존 Firestore 문서는 삭제하거나 마이그레이션하지 않았다.

## 검증

- `npm.cmd test`: 11 tests 통과.
- `npm.cmd run verify`: 92 JS files checked.
- `npm.cmd run verify:recipes`: 11 samples 통과.
- `git diff --check`: 통과.
- GitHub Pages workflow `29185843652`: APK build, verify, Pages build, deploy 성공.
- production `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production 실제 확인:
  - 홈: 2주 예산·보상·카테고리·고정비 렌더.
  - 목표: 차트, 20년 축적표, 시뮬레이션 관리 펼침과 3개 목록.
  - 설정: 예산 카드, 카테고리 입력, 보상 설정, APK link.
  - 거래: 월 캘린더, 일별 거래, 환급, FAB.
  - 380px viewport: 가로 overflow 없음, 거래 캘린더/FAB/하단 탭 정상.
  - production asset: `20260712-retired-surface` CSS/JS cache version 확인.

## 제한 및 리뷰 판단

- 와인 셀러는 현재 공개 내비게이션에 직접 진입점이 없고, 욕구 기록을 Firestore에
  생성한 뒤 결과 화면을 거쳐야만 들어갈 수 있다. 검증용 사용자 데이터를 만들지
  않았으며, 이번 슬라이스에서는 wine renderer와 wine selector 자체를 변경하지 않았다.
  production에서 해당 selector를 포함한 `50-app-flows.css`가 로드되는 것까지 확인했다.
- 이 접근성 문제는 미사용 선택/cart 표면 정리의 회귀가 아니며, 이후 UI feature 분리
  슬라이스에서 감각뱅크 진입 구조를 함께 검토한다.
- 선택/cart 표면 정리 범위에서 차단 이슈는 없다.

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 2에서 root `data.js` 공개 계약을 유지한 채 내부 repository를 분리한다.
