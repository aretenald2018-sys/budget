# Reels Share Target 캡션 레시피 파싱 복구 리뷰

## 결과

- 상태: 조건부 통과
- 범위: Android/PWA share target의 `text` 캡션을 레시피 preview API 입력으로 전달

## 확인한 것

- `vercel-api/api/preview.js`는 `req.query.text`를 8000자까지 정리해 `buildRecipePreview(rawUrl, sharedText)`로 전달한다.
- shared caption이 있으면 `meta.description`, `textForAi`, 응답 `source.caption`에 우선 반영된다.
- YouTube는 기존처럼 transcript 조회를 유지하며, shared caption이 있어도 transcript 입력을 함께 보존한다.
- root fallback의 `api/_lib/recipe-preview.js`와 `api/market-symbol-search.js`도 같은 `text` 입력 채널을 받는다.
- `choice/share-preview.js`는 `recipePreviewEndpoint(url, { text, title })`와 `fetchRecipePreview()`를 제공한다.
- `render-cart.js`는 `consumeSharedCartDraft()`에서 `sharedCaption`을 보존하고, 공유 레시피 저장 전에 API preview에 전달한다.
- `index.html`, `app.js`, `render-cart.js` cache-busting query string이 갱신됐다.
- repo root 검색 결과 `sw.js`/`STATIC_ASSETS`는 없어서 `CACHE_VERSION` 갱신 대상은 없었다.

## 검증

- `node --check vercel-api/api/preview.js`: 통과
- `node --check api/_lib/recipe-preview.js`: 통과
- `node --check api/market-symbol-search.js`: 통과
- `node --check choice/share-preview.js`: 통과
- `node --check render-cart.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 96 JS files checked)
- 샘플 shared caption 직접 호출:
  - root fallback: `ingredients=4`, `steps=2`, `sharedCaptionAvailable=true`, `source.caption` shared text 우선 확인
  - Vercel handler: HTTP `200`, `ingredients=6`, `steps=3`, `sharedCaptionAvailable=true`, `source.caption` shared text 우선 확인
- `npm.cmd run verify:registered-recipes`: 통과. 기존 등록 Instagram 3개는 text 없이 검증하므로 계속 재료/순서 0개이며, 이번 변경의 예상 범위다.
- `git diff --check`: 통과

## 잔여 리스크

- Vercel production에는 아직 이 변경이 배포되지 않았다.
- Android Instagram 앱의 실제 공유 intent가 caption을 `text`로 전달하는지 실기기에서 최종 확인해야 한다.
- URL만 붙여넣거나 기존 저장 Reels처럼 shared text가 없는 경로는 기존처럼 Instagram caption을 얻지 못할 수 있다.

## 결론

코드 경로와 로컬 API 함수 검증 기준으로는 문제를 발견하지 못했다. 배포 후 `text` 포함 production API 호출과 Android PWA share target 실기기 확인이 남아 있다.
