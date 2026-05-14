# Vercel API 브리지 구현 리뷰

## 결론

- 상태: 조건부 통과
- 범위: `vercel-api/` 단일 gateway function, GitHub Pages 외부 API base 연결, 배포 문서
- 남은 확인: 실제 Vercel 배포 도메인에서 LLM key를 넣고 YouTube Shorts/Reels 샘플을 호출하는 운영 검증

## 확인한 것

- `vercel-api/api/preview.js` 문법 검사를 통과했다.
- `utils/api-base.js`, `choice/share-preview.js`, `app.js`, `scripts/verify-project.mjs` 문법 검사를 통과했다.
- `npm.cmd run verify`가 통과했다.
- `window.BUDGET_API_BASE`가 있을 때 `/api/preview?kind=recipe&url=...` 외부 URL을 조립하는 것을 확인했다.
- `ALLOWED_ORIGIN`을 설정한 상태에서 Vercel handler의 CORS preflight가 HTTP 204와 허용 origin을 반환하는 것을 확인했다.
- `ALLOWED_ORIGIN`이 없을 때 임의 외부 origin은 403으로 차단된다.

## 리스크

- Instagram Reels는 로그인, CORS, 페이지 HTML 제한 때문에 YouTube보다 안정성이 낮다. 이 구현은 접근 가능한 OG/meta 텍스트와 LLM 추론으로 최대한 보완하지만, 모든 Reels에서 자막을 안정 추출한다고 보장할 수는 없다.
- 실제 LLM 추출 품질은 `GROQ_API_KEY` 또는 `GEMINI_API_KEY` 설정 후 운영 URL에서만 완전히 확인할 수 있다.
- 기존 root `api/`는 GitHub Actions 및 다른 fallback 경로와 연결되어 있으므로 삭제하지 않았다. Vercel 함수 수 제한 회피는 Vercel Project Root Directory를 `vercel-api`로 설정하는 방식으로 해결한다.

## 배포 체크

1. Vercel Project Root Directory를 `vercel-api`로 설정한다.
2. `ALLOWED_ORIGIN`에 GitHub Pages origin을 넣는다.
3. `GROQ_API_KEY` 또는 `GEMINI_API_KEY`를 넣는다.
4. `config.js`의 `apiBaseUrl`에 Vercel API origin을 넣는다.
5. GitHub Pages 앱에서 Shorts URL을 붙여 제목, 썸네일, 재료, 조리순서가 채워지는지 확인한다.
