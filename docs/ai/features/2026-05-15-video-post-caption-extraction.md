# 영상 게시글 본문 레시피 추출 보강 계획

## 요청

릴스나 숏츠는 영상과 별도로 게시글 본문/설명에 레시피나 조리순서를 적어두는 경우가 많으므로, 이 텍스트도 자동 파싱에 참고하는지 확인하고 없거나 약하면 구현한다.

## 현재 확인

- YouTube Shorts: Vercel API에서 `videoDetails.shortDescription`을 `meta.description`으로 넣고 LLM 입력에 포함한다. 즉 설명란 참고 기능은 있다.
- Instagram Reels/TikTok: 현재는 공개 HTML의 `og:description` 정도만 읽는다. 게시글 caption이 JSON-LD, `edge_media_to_caption`, `caption.text`, embedded JSON 안에 있을 때는 놓칠 수 있다.

## 실행 슬라이스

### 슬라이스 1: Vercel API caption 추출 강화

- 상태: 실행 대기
- 범위:
  - `vercel-api/api/preview.js`의 generic video metadata 추출을 강화한다.
  - `description`, `og:description`, `twitter:description`, JSON-LD `description/caption`, Instagram `edge_media_to_caption`, `caption.text`, TikTok embedded JSON description 후보를 모아 가장 긴 본문을 사용한다.
  - source caption에는 transcript가 없으면 post caption을 저장한다.
  - root fallback API `api/_lib/recipe-preview.js`도 같은 방향으로 최소 보강한다.
- 수정하지 말 것:
  - 브라우저에 Instagram/TikTok scraping 추가
  - API key를 브라우저로 이동
  - Firebase 데이터 쓰기

## 검증

- `node --check vercel-api/api/preview.js`
- `node --check api/_lib/recipe-preview.js`
- `npm.cmd run verify`
- Vercel API 재배포 후 `npm.cmd run verify:deployed-recipe-api -- https://budget-api-liart.vercel.app`

## 완료 기준

- YouTube 설명란은 계속 입력에 포함된다.
- Instagram/TikTok 공개 HTML에 caption 후보가 있으면 `meta.description`으로 LLM 입력에 들어간다.
- 운영 API가 HTTP 200/CORS 정상으로 응답한다.
