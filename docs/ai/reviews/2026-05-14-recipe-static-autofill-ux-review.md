# 레시피 정적 자동채움 UX 보완 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-05-14-recipe-static-autofill-ux.md`
- 슬라이스: 슬라이스 1 `레시피 UI 노출과 수동 복구`, 슬라이스 2 `정적 메타데이터와 휴리스틱 확장`
- 변경 파일: `render-cart.js`, `choice/recipe-ui.js`, `choice/recipe-runtime.js`, `choice/recipe-autofill.js`, `choice/capture-ui.js`, `choice/capture-payload.js`, `styles/70-reports.css`, `style.css`, `app.js`, `index.html`, `package.json`, `scripts/verify-recipe-autofill.mjs`

## 결과

- 발견된 차단 이슈: 없음
- 남은 제한: 실제 Firebase 로그인 데이터가 있는 선택탭/레시피 상세 모달은 sandbox에서 장기 dev server를 실행하지 않는 프로젝트 규칙 때문에 not verified yet이다.

## 확인한 항목

- 레시피 카드 미리보기 UI는 `choice/recipe-ui.js`의 `recipeIngredientChipPreview()`로 분리되어 `render-cart.js` 길이 제한을 넘지 않는다.
- 상세 모달의 레시피 UI는 `#modals-container`에 붙는 구조를 고려해 `.choice-detail-sheet` 스코프 CSS를 사용한다.
- `ingredients[].acquired`는 optional 필드이며, 기존 `selectedSource()` 기반 주문처 선택과 함께 `isIngredientDecided()`에서 완료로 인정된다.
- 주문처가 이미 선택된 재료는 상세 체크박스를 disabled 처리해 사용자가 “준비됨” 체크로 주문처 선택을 실수로 해제하지 않게 했다.
- 수동 붙여넣기는 구조화 필드가 비어 있을 때만이 아니라 다시 붙여넣기에도 사용할 수 있고, 기존 수동 메모는 자동 메모가 아닐 때 `원문 메모`로 보존된다.
- cache-busting query string이 `20260514-recipe-ui`로 갱신됐다.
- 레시피 자동채움 쿼리 경로는 `20260514-recipe-heuristic`으로 추가 갱신됐다.
- YouTube 메타데이터 조회는 공식 oEmbed를 먼저 시도하고 실패하면 noembed로 fallback한다.
- 프리셋은 총 61개 수준으로 확장됐고, 프리셋 실패 시에도 후보 재료가 2개 이상이면 `static-ingredient-candidates` preview를 반환한다.
- `extractCandidateIngredientsFromText(text)`가 export되어 fixture 검증에서 직접 확인 가능하다.
- 기등록 Firestore `cart_items` 기준 Shorts/Reels 9개를 읽기 전용으로 검증했다. YouTube 6개 중 6개는 재료/순서 표시 가능, Instagram 3개는 저장된 제목/메모가 `instagram.com` 수준이라 정적 fallback만으로는 재료/순서를 만들지 못했다.
- 기등록 YouTube 2개는 기존 재료가 1개뿐이었지만 fallback 후보가 7~9개 있었다. 표시용 fallback이 기존 1개에 묶이지 않도록 sparse 재료 병합을 추가했다.
- `STATIC_ASSETS`/`CACHE_VERSION` 검색 결과 repo root에 `sw.js`는 없었다.

## 검증 기록

- `node --check render-cart.js`
- `node --check choice/recipe-runtime.js`
- `node --check choice/recipe-autofill.js`
- `node --check choice/capture-ui.js`
- `node --check choice/capture-payload.js`
- `node --check choice/recipe-ui.js`
- `npm.cmd run verify`
- `npm.cmd run verify:recipes`
- `npm.cmd run verify:registered-recipes`
- `node --input-type=module`로 `recipePartsFromManualText()` 예시 파싱 확인
- `node --input-type=module`로 `choice/recipe-ui.js` import 확인
- `node --input-type=module`로 실제 YouTube URL `buildStaticRecipePreview()` title/image/ingredients 채움 확인

## 잔여 리스크

- not verified yet: normal terminal에서 `npm.cmd run dev -- --host 127.0.0.1 --port 5501` 실행 후 실제 레시피 카드/상세 모달/체크 상태 유지/수동 붙여넣기를 눈으로 확인해야 한다.
- not verified yet: 실제 Vercel 운영 URL과 LLM key를 붙인 Shorts/Reels end-to-end 추출은 사용자 계정 credential이 필요하다.
- Instagram Reels는 현재 기등록 데이터에 제목/설명/자막 텍스트가 남아 있지 않아 GitHub Pages 정적 fallback으로는 복구할 입력이 없다. Vercel API bridge + LLM key 배포 후 재검증이 필요하다.
