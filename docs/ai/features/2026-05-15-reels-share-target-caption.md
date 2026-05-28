# Reels Share Target 캡션 레시피 파싱 복구 계획

## 요청

Instagram Reels 공개 HTML에는 비로그인 트래픽에서 caption이 내려오지 않아 재료/조리순서가 비어 있다. Android Instagram 앱의 공유 메뉴가 PWA `share_target`으로 전달하는 `text` 파라미터를 레시피 LLM 입력에 우선 사용해, Reels 공유 진입 시 재료/조리순서가 자동 추출되게 한다.

## 진단 결과

- `docs/ai/reviews/2026-05-15-video-post-caption-extraction-review.md`에서 운영 Reels 3개가 HTTP 200/CORS 정상이어도 caption 후보가 없어 재료/순서 0개로 확인됐다.
- OCR/스크린샷은 로그인 게이트와 서버리스 비용 때문에 이번 해결책에서 제외한다.
- `manifest.webmanifest`의 `share_target`은 이미 `?shareTarget=cart`로 연결되어 있고, `render-cart.js`는 `text`를 `rawText`로 읽지만 현재는 note로 축약한 뒤 API 입력에는 전달하지 않는다.

## 실행 슬라이스

### 슬라이스 1: Share Target text 우선 레시피 입력

- 상태: 실행 완료
- 범위:
  - `vercel-api/api/preview.js`에서 `req.query.text`를 8000자까지 정리해 `buildRecipePreview(rawUrl, sharedText)`로 전달한다.
  - `buildRecipePreview()`는 metadata fetch를 유지하되 shared text가 있으면 `meta.description`과 AI 입력, `source.caption`에 우선 반영한다.
  - `api/_lib/recipe-preview.js`와 `api/market-symbol-search.js` root fallback에도 같은 입력 채널을 맞춘다.
  - `choice/share-preview.js`의 `recipePreviewEndpoint(url, { text, title } = {})`를 확장하고 server/static fallback URL에 선택적으로 `text/title`을 붙인다.
  - `render-cart.js`의 share draft에 `sharedCaption`을 보존하고, 공유 레시피 저장 전 preview API 호출에 전달한다.
  - 수정한 JS 모듈의 cache-busting query string을 갱신한다.
- 수정하지 말 것:
  - OCR/스크린샷 경로
  - 3rd-party Instagram scraper API
  - LLM provider/model 변경
  - `manifest.webmanifest` action 변경

## 검증

- `node --check vercel-api/api/preview.js`
- `node --check api/_lib/recipe-preview.js`
- `node --check api/market-symbol-search.js`
- `npm.cmd run verify`
- 가능하면 Vercel 배포 후 `text` 포함 `/api/preview?kind=recipe&url=...&text=...`와 `text` 없는 호출을 비교한다.
- 실기기 최종 확인은 Android Instagram 앱에서 Reels 공유 → 가계부 선택 → 레시피 카드에 재료/조리순서가 채워지는지 확인한다.

## 완료 기준

- Reels share target의 `text`가 서버 LLM 입력과 fallback heuristic 입력에 들어간다.
- 응답 `source.caption`은 shared text를 우선 보존한다.
- YouTube Shorts transcript 흐름은 기존처럼 우선 동작한다.
- 브라우저 API base가 없을 때의 root fallback도 같은 `text` 파라미터를 받을 수 있다.

## 실행 결과

- `vercel-api/api/preview.js`와 `api/_lib/recipe-preview.js`가 `sharedText`를 받아 `meta.description`, LLM 입력, `source.caption`에 우선 반영한다.
- `api/market-symbol-search.js` root fallback도 `text`를 `buildRecipePreview()`에 전달한다.
- `choice/share-preview.js`는 `recipePreviewEndpoint(url, { text, title } = {})`와 `fetchRecipePreview()`를 제공한다.
- `render-cart.js`는 share draft의 `sharedCaption`을 보존하고 공유 레시피 저장 전 preview API에 전달한다.
- `index.html`, `app.js`, `render-cart.js` cache-busting query string을 갱신했다.

## 검증 결과

- `node --check vercel-api/api/preview.js`: 통과
- `node --check api/_lib/recipe-preview.js`: 통과
- `node --check api/market-symbol-search.js`: 통과
- `node --check choice/share-preview.js`: 통과
- `node --check render-cart.js`: 통과
- `npm.cmd run verify`: 통과 (`96 JS files checked`)
- 샘플 shared caption으로 root fallback과 Vercel handler를 직접 호출해 둘 다 `ingredients >= 1`, `steps >= 1`, `sharedCaptionAvailable === true`, `source.caption` shared text 우선을 확인했다.
