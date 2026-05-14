# 영상 게시글 본문 레시피 추출 보강 리뷰

## 결과

- 상태: 조건부 통과
- 범위: Vercel API와 root fallback API의 영상 게시글 caption/description 추출 보강

## 확인한 것

- YouTube Shorts는 기존에도 `videoDetails.shortDescription`을 LLM 입력에 넣고 있었다.
- Instagram/TikTok은 기존에 `og:description` 중심이라, embedded JSON/JSON-LD caption을 놓칠 수 있었다.
- `postCaptionFromHtml()`을 추가해 `og:description`, `twitter:description`, 일반 `description`, JSON-LD `description/caption/text/articleBody`, Instagram `edge_media_to_caption`, `caption.text`, TikTok류 `desc/share_desc` 후보를 모아 가장 유효한 본문을 고른다.
- `node --check vercel-api/api/preview.js`, `node --check api/_lib/recipe-preview.js`, `npm.cmd run verify`가 통과했다.
- Vercel API를 production에 재배포했다. Alias는 `https://budget-api-liart.vercel.app`이다.
- 운영 API 기등록 Shorts/Reels 9개 검증에서 HTTP 200과 CORS는 모두 정상이다.

## 운영 검증 결과

- YouTube 6개: Gemini quota 초과 상태에서도 fallback으로 재료 7~8개, 조리순서 3개 반환.
- Instagram 3개: HTTP 200/CORS 정상이나 현재 공개 HTML/저장 메타데이터에서 레시피 본문을 얻지 못해 재료/순서 0개.

## 잔여 리스크

- Instagram은 공개 HTML에 caption이 노출되지 않거나 로그인/봇 차단 페이지가 내려오면 서버에서도 본문을 읽을 수 없다.
- Gemini quota가 현재 초과 상태라 LLM 기반 정밀 추출은 정상 과금/쿼터 상태에서 다시 확인해야 한다.
