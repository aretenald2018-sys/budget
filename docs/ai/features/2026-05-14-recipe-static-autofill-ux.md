# 레시피 정적 자동채움 UX 보완 계획

## 요청 원문

인스타 릴스/유튜브 Shorts URL을 붙이면 식재료와 조리순서를 자동 추출해 메모에 저장하는 흐름을 추가 보완 검토하고, 더 나은 대안이 있으면 그대로 수용하지 말고 적극적으로 수정한다.

## 이해한 내용

- 목표: GitHub Pages 정적 배포 제약 안에서 레시피 링크 저장 경험을 더 믿을 수 있게 만든다. 먼저 이미 추출되었거나 직접 입력된 재료/조리순서를 카드와 상세에서 잘 보이게 하고, 다음으로 서버 없이 가능한 YouTube 메타데이터/휴리스틱 자동채움률을 올린다.
- 비목표: 이번 기본 계획에서는 브라우저에 LLM API key를 저장하는 BYOK, Instagram/TikTok 본문/자막 추출, 백엔드 배포 옵션 비교, OCR/영상 프레임 분석을 구현하지 않는다.
- 사용자 흐름: 사용자가 선택탭 검색창에 Shorts/Reels/레시피 URL을 붙여넣으면 제목/썸네일/재료 후보가 가능한 만큼 채워지고, 실패해도 저장 전후에 자막/설명문을 붙여넣어 재료와 조리순서를 직접 구조화할 수 있어야 한다.
- 데이터 가정: 레시피의 구조화 데이터는 `items[].ingredients`, `items[].steps`, `items[].summary`, `items[].note`, `items[].source.caption`을 우선 사용한다. `note`는 표시용/백업 텍스트이고, 체크리스트 상태는 `ingredients` 배열에 저장한다.
- 열려 있는 질문: 없음. 사용자가 “더 나은 대안이 있으면 수정”을 허용했고, Phase 3 BYOK는 원문에서도 명시 요청 시에만 진행한다고 되어 있으므로 이번 계획에서는 제외한다.

## 코드 조사 결과

- `render-cart.js`에는 이미 URL 붙여넣기 자동 submit, `previewCartLink()`, 정적 fallback `buildStaticRecipePreview()`, `withRecipeFallbackDisplay()`가 연결되어 있다.
- `choice/recipe-autofill.js`에는 `noembed` 기반 YouTube 메타데이터 조회, 약 9개 프리셋, 작은 식재료 사전 기반 `inferIngredients()`가 이미 들어 있다. 즉 Phase 2의 일부는 이미 구현되어 있지만 범위가 작다.
- `recipeCard()`에는 재료 row와 주문처 선택 UI가 있으나, 현재 선택탭 IA의 카드 `choiceProductCard()`와 상세 모달 `choiceItemDetailHtml()`에서는 구조화된 레시피가 거의 드러나지 않는다.
- `isIngredientDecided()`는 `selectedSource()`만 true로 보므로 “집에 있음/준비됨” 같은 체크 상태를 표현하기 어렵다. 체크리스트를 만들려면 `acquired` 또는 `checked` 상태를 정식으로 normalize해야 한다.
- `sw.js`는 repo root 검색 결과 발견되지 않았다. 그래도 CSS/JS 변경 시 `index.html`, `app.js`, 동적 import query string은 갱신한다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: “정적 배포 한계 때문에 LLM 추출을 바로 밀어붙일 것인가, 사용자가 체감하는 정보 노출과 실패 복구를 먼저 고칠 것인가?”
- 추천 답변: 정보 노출과 실패 복구를 먼저 고친다. 현재 문제는 LLM 부재 자체보다 저장된 재료/순서가 카드와 상세에서 보이지 않아 사용자가 ‘비어 있다’고 느끼는 부분이 더 크다.
- 사용자 답변: 직접 질문하지 않음. 요청문이 Phase 1 우선, Phase 2 다음, BYOK 선택으로 우선순위를 이미 제시했고 코드 확인으로 결정 가능했다.
- 확정된 결정: 슬라이스 1은 UI 노출/수동 복구만 구현한다. 슬라이스 2는 정적 메타데이터와 휴리스틱 확장만 구현한다. BYOK는 별도 명시 요청 전까지 보류한다.
- 남은 가정: 실제 Firebase 로그인 데이터 화면은 자동 검증이 막힐 수 있다. 그 경우에도 fixture/DOM 기반 검증과 사용자가 실행할 명령/URL을 남긴다.

## 결정 기록

- 결정: 레시피 체크리스트는 `decidedSourceId`를 가짜로 채우지 않고 `ingredients[].acquired`를 지원한다.
- 이유: `decidedSourceId`는 주문처 선택을 뜻하므로 “이미 집에 있는 재료”와 의미가 다르다. `isIngredientDecided()`가 `acquired` 또는 실제 `selectedSource()`를 모두 완료로 보게 하면 기존 주문처 모델과 충돌하지 않는다.
- 되돌릴 수 있는가: 예. `acquired`는 optional 필드이고 기존 데이터는 그대로 동작한다.

- 결정: YouTube 메타데이터 조회는 `choice/video-preview.js`보다 `choice/recipe-autofill.js`에 둔다.
- 이유: 썸네일 표시용 visual helper와 레시피 휴리스틱 입력을 분리하면 중복 fetch를 줄이고, 정적 자동채움 로직을 한 모듈에서 테스트할 수 있다.
- 되돌릴 수 있는가: 예. 나중에 공용 metadata helper로 추출할 수 있다.

- 결정: Phase 3 BYOK는 이번 실행 범위에서 제외한다.
- 이유: GitHub Pages에서 완전 추출을 가능하게 하지만 브라우저 localStorage key 저장, 요금, CORS, 사용자 동의 UX가 모두 얽힌다. 기본 기능 개선과 보안 민감 옵션을 한 슬라이스에 섞지 않는다.
- 되돌릴 수 있는가: 예. 별도 ADR/계획으로 추가 가능하다.

## 실행 슬라이스

### 슬라이스 1: 레시피 UI 노출과 수동 복구

- 상태: 실행 및 리뷰 완료, 브라우저 UI 검증은 not verified yet
- 목표: 이미 있는 재료/조리순서가 레시피 카드와 상세 모달에서 바로 보이고, 자동 추출 실패 시 사용자가 자막/설명문을 붙여넣어 구조화할 수 있게 한다.
- 범위:
  - `choiceProductCard()`에서 레시피 item일 때 재료 칩 3~5개와 추가 개수 표시를 노출한다.
  - 레시피 빈 상태 카피를 정적 배포 기대치에 맞게 수정한다.
  - `choiceItemDetailHtml()`에 레시피 전용 구조화 섹션을 추가한다: 재료 체크리스트, 조리순서 stepper, 비어 있을 때 자막/설명문 붙여넣기 CTA.
  - `ingredients[].acquired`를 `normalizedIngredients()`와 `isIngredientDecided()`에 반영한다.
  - 상세 모달에서 재료 체크 변경 시 `updateCartItem(itemId, { ingredients })`로 저장하고, 닫았다 다시 열어도 상태가 유지되게 한다.
  - 수동 붙여넣기 parser는 먼저 bullet/번호/섹션 헤더 기반 deterministic parser로 구현하고, `recipeMemoFromParts()`와 hidden form fields를 재사용한다.
  - CSS는 기존 선택탭 스타일 안에서 칩, 체크리스트, step card, manual paste block만 추가한다.
- 예상 수정 파일:
  - `render-cart.js`
  - `choice/recipe-runtime.js`
  - `choice/recipe-ui.js`
  - `choice/recipe-autofill.js`
  - `choice/capture-ui.js`
  - `styles/70-reports.css`
  - `styles/80-responsive.css`
  - `app.js`
  - `index.html`
- 수정하지 말 것:
  - 프리셋 50개 확장
  - BYOK LLM 호출
  - Firestore 컬렉션 구조 변경
  - Instagram/TikTok scraping 시도
  - 선택탭 IA 추가 재편
- 구현 메모:
  - 메모 텍스트를 다시 파싱하는 것보다 구조화 필드가 있으면 구조화 필드를 source of truth로 삼는다.
  - 조리 stepper의 현재 단계는 Firestore에 저장하지 않고 모달 내부 상태 또는 `localStorage` keyed by item id로 둔다. 조리 진행 상태는 쇼핑 데이터가 아니므로 서버 동기화하지 않는다.
  - 추출 실패 CTA는 “서버 API가 없어 실패했다”를 기술적으로 드러내기보다 “자막/설명문을 붙여넣으면 정리할 수 있음”을 행동으로 보여준다.
- 검증 방법:
  - 손으로 레시피 item 1개를 만들거나 fixture를 주입해 `ingredients` 5개, `steps` 3개를 가진 상태에서 레시피 탭 카드 칩과 `+N` 표시를 확인한다.
  - 상세 모달에서 재료 1개를 체크하고 저장/재렌더 후 체크 상태와 진행률이 유지되는지 확인한다.
  - 재료/순서가 비어 있는 레시피에서 수동 붙여넣기 textarea에 `재료`/`조리순서` 텍스트를 넣고 구조화 필드와 메모가 채워지는지 확인한다.
  - `node --check render-cart.js`, `node --check choice/recipe-runtime.js`, `node --check choice/recipe-autofill.js`, `npm.cmd run verify`를 실행한다.
- 완료 증거:
  - 카드에 레시피 재료 칩이 보임
  - 상세 모달에 체크리스트와 조리 stepper가 보임
  - 체크 상태가 닫기/재진입 후 유지됨
  - 자동 추출 실패/빈 레시피에서 수동 붙여넣기 CTA가 보임
  - Windows normal terminal에서 `npm.cmd run dev -- --host 127.0.0.1 --port 5501` 실행 후 `http://127.0.0.1:5501/` HTTP 200
- 실행 기록:
  - `choiceProductCard()`에 레시피 재료 칩과 추가 재료 수 표시를 추가했다.
  - 레시피 상세 모달에 구조화 섹션을 추가했다. 재료 체크리스트, 조리순서 stepper, 자막/설명문 수동 붙여넣기 CTA를 제공한다.
  - `ingredients[].acquired`를 추가 지원해 주문처 선택 없이도 “준비됨” 체크 상태를 저장할 수 있게 했다.
  - 수동 붙여넣기 parser `recipePartsFromManualText()`를 추가하고, 상세 모달에서 구조화 필드와 메모를 갱신하게 했다.
  - `render-cart.js` 길이 제한을 지키기 위해 순수 UI helper를 `choice/recipe-ui.js`로 분리했다.
  - cache-busting query string을 `20260514-recipe-ui`로 갱신했다.
  - 자동 검증: `node --check render-cart.js`, `node --check choice/recipe-runtime.js`, `node --check choice/recipe-autofill.js`, `node --check choice/capture-ui.js`, `node --check choice/capture-payload.js`, `node --check choice/recipe-ui.js`, `npm.cmd run verify` 통과.
  - 수동 parser 확인: `재료/조리순서` 예시 텍스트가 `계란 2개`, `대파 1대`, 2개 조리 단계로 파싱됨.
  - 실제 브라우저 UI 검증은 dev server를 normal terminal에서 실행해야 하므로 not verified yet.
- 리뷰 기록:
  - `docs/ai/reviews/2026-05-14-recipe-static-autofill-ux-review.md`에 리뷰 결과를 남겼다.
  - 차단 이슈는 없고, 남은 리스크는 실제 로그인 데이터 화면에서의 레시피 카드/상세 모달 시각 검증이다.
- 다음 세션 시작 프롬프트:
  - 이 계획 문서를 읽고 슬라이스 1만 실행한다. 앱 코드는 레시피 UI 노출과 수동 복구 범위만 수정하고, 프리셋 확장/BYOK/백엔드 변경은 하지 않는다.

### 슬라이스 2: 정적 메타데이터와 휴리스틱 확장

- 상태: 실행 및 리뷰 완료
- 목표: 서버 API 없이도 YouTube Shorts 제목/채널/공유 텍스트에서 더 많은 레시피의 재료 후보를 채운다.
- 범위:
  - YouTube 공식 oEmbed를 먼저 호출하고 실패하면 기존 `noembed`로 fallback한다.
  - `PRESETS`를 최소 50개로 확장하되 한식/분식/양식/중식/일식/디저트의 자주 쓰는 요리부터 넣는다.
  - 식재료 사전을 100개 이상으로 늘리고, `extractCandidateIngredientsFromText(text)`를 export해 fixture 검증이 가능하게 한다.
  - 프리셋 매칭 실패 시에도 식재료 후보가 2개 이상이면 “후보 재료” preview를 반환한다. 이때 조리순서는 비워 두고 summary/warning에 후보 추출임을 명확히 쓴다.
  - `withRecipeFallbackDisplay()`에서도 후보 재료 fallback을 사용할 수 있게 한다.
  - 가능한 경우 작은 검증 스크립트 또는 fixture 목록으로 대표 제목 10개 이상을 자동 확인한다.
- 예상 수정 파일:
  - `choice/recipe-autofill.js`
  - `render-cart.js`
  - 필요 시 `scripts/verify-recipe-autofill.mjs`
  - `app.js`
  - `index.html`
- 수정하지 말 것:
  - LLM 호출
  - Instagram/TikTok 본문 fetch
  - 사용자의 개인 프리셋 학습
- 구현 메모:
  - 프리셋은 코드 가독성을 해치지 않게 factory/helper 또는 데이터 섹션으로 정리한다.
  - “정확한 조리순서”가 아닌 기본 레시피 템플릿임을 summary에 남긴다.
  - 휴리스틱이 제목만으로 과신하지 않게, 후보 추출인 경우 UI 카피에서 “후보”를 유지한다.
- 검증 방법:
  - `김치찌개 레시피`, `초간단 청양고추 계란말이`, `라자냐`, `마파두부`, `오므라이스`, `브라우니` 같은 표본 제목으로 preview 결과를 확인한다.
  - 임의 YouTube Shorts URL에서 oEmbed 또는 noembed 200 응답으로 제목/썸네일이 채워지는지 확인한다.
  - `node --check choice/recipe-autofill.js`, `node --check render-cart.js`, `npm.cmd run verify`를 실행한다.
- 완료 증거:
  - 표본 10개 중 5개 이상에서 preset 또는 후보 재료가 채워짐
  - preset 실패 제목에서도 후보 재료 2개 이상이면 메모/ingredients가 생성됨
  - YouTube oEmbed 실패 시 noembed fallback으로 계속 동작함
- 실행 기록:
  - YouTube 메타데이터 조회를 공식 oEmbed 우선, noembed fallback 순서로 바꿨다.
  - 레시피 프리셋을 총 61개 수준으로 확장했다. 한식, 분식, 양식, 중식, 일식, 디저트를 포함한다.
  - 식재료 사전을 100개 이상으로 확장하고 `extractCandidateIngredientsFromText(text)`를 export했다.
  - 프리셋 매칭 실패 시 후보 재료가 2개 이상이면 `static-ingredient-candidates` preview를 반환하게 했다.
  - `scripts/verify-recipe-autofill.mjs`와 `npm.cmd run verify:recipes`를 추가했다.
  - cache-busting query string을 `20260514-recipe-heuristic`으로 갱신했다.
  - 자동 검증: `node --check choice/recipe-autofill.js`, `node --check render-cart.js`, `node --check choice/capture-payload.js`, `node --check app.js`, `node --check scripts/verify-recipe-autofill.mjs`, `npm.cmd run verify:recipes`, `npm.cmd run verify` 통과.
  - 표본 검증: 11개 제목 샘플 모두 preset 또는 후보 재료 preview를 반환했다.
  - 네트워크 검증: 실제 YouTube URL로 `buildStaticRecipePreview()`를 호출해 title/image/ingredients가 채워지는 것을 확인했다.
- 다음 세션 시작 프롬프트:
  - 이 계획 문서를 읽고 슬라이스 2만 실행한다. 슬라이스 1 UI 변경을 건드리지 말고 정적 메타데이터/휴리스틱 범위만 수정한다.

### 슬라이스 3: 리뷰

- 상태: 완료
- 목표: 레시피 UI/정적 자동채움 변경이 기존 선택탭, 구매 보류함, recipe card, Firestore 저장 흐름을 깨지 않았는지 검토한다.
- 범위:
  - 슬라이스 1, 2 변경 파일 중심으로 회귀와 검증 누락을 찾는다.
  - cache-busting query string과 `STATIC_ASSETS`/`CACHE_VERSION` 대상 누락 여부를 재확인한다.
  - 인증 없는 환경에서 가능한 HTTP 200, 브라우저 부팅, 콘솔 error/warn, fixture 검증을 확인한다.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-05-14-recipe-static-autofill-ux-review.md`
  - 필요 시 `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 리뷰 중 새 기능 구현
  - BYOK 추가
- 구현 메모:
  - 문제가 있으면 다음 상태를 `ready_for_fix`로 두고, 고칠 범위를 리뷰 발견 이슈로 제한한다.
- 검증 방법:
  - 계획의 완료 증거와 실제 변경 파일을 대조한다.
- 완료 증거:
  - 차단 이슈 없음 또는 발견 이슈가 파일/라인/재현 방법과 함께 기록됨
- 리뷰 기록:
  - `docs/ai/reviews/2026-05-14-recipe-static-autofill-ux-review.md`에 슬라이스 2까지 포함한 리뷰 결과를 갱신했다.
  - 차단 이슈는 없고, 실제 Firebase 로그인 데이터가 필요한 UI 시각 검증은 not verified yet로 남겼다.
- 다음 세션 시작 프롬프트:
  - 이 계획 문서와 레시피 관련 변경 파일을 읽고 리뷰 세션만 수행한다. 새 기능 구현은 하지 않는다.

## 이후 보류 항목

- BYOK LLM: 사용자가 명시적으로 원하면 별도 계획으로 설정 화면, 보안 안내, key 테스트, client LLM 호출, 자막 붙여넣기 흐름을 다룬다.
- 사용자 학습 프리셋: 수동 입력이 충분히 누적된 뒤 localStorage 기반 사용자 프리셋을 별도 슬라이스로 검토한다.
- 백엔드 옵션: GitHub Pages 유지 의사가 바뀌면 Cloudflare Workers/Vercel/Netlify Functions 비교를 별도 ADR로 다룬다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트,
오래된 캐시/서비스워커 이슈, UX 깨짐을 우선 리뷰한다. 리뷰 중에는 새 기능을
구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 완료
- 다음 자동 상태: `complete`
- 다음 액션: 남은 코드 슬라이스 없음. 실제 브라우저 UI와 Vercel 운영 URL은 사용자 환경에서 확인한다.
- 차단 질문: 없음
