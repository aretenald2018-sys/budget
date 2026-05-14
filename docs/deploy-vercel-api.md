# Vercel API Bridge Deployment

GitHub Pages는 정적 앱만 호스팅하고, 릴스/숏츠 레시피 파싱 API만 Vercel에서 처리한다.

## Vercel 프로젝트 설정

1. Vercel에서 새 프로젝트를 만들거나 기존 프로젝트 설정을 연다.
2. Root Directory를 `vercel-api`로 설정한다.
3. Build Command는 비워 둔다.
4. Output Directory도 비워 둔다.
5. Functions는 `api/preview.js` 하나만 배포된다.

기존 root 프로젝트를 Vercel에 연결해 두었다면 root 전체가 아니라 `vercel-api`만 보도록 Root Directory를 반드시 바꾼다. 함수 수 제한을 피하는 핵심 설정이다.

## 환경 변수

필수:

- `ALLOWED_ORIGIN`: GitHub Pages origin. 예: `https://<github-id>.github.io`
- `GROQ_API_KEY` 또는 `GEMINI_API_KEY`: 레시피 추출용 LLM key

권장:

- `RECIPE_LLM_PROVIDER`: `groq` 또는 `gemini`
- `GROQ_MODEL`: 기본값 `llama-3.1-8b-instant`
- `GEMINI_MODEL`: 기본값 `gemini-1.5-flash`
- `CORS_ALLOW_LOCAL`: 로컬 테스트를 허용하려면 `1`

## GitHub Pages 연결

배포된 Vercel API 주소를 `config.js`에 넣는다.

```js
export const apiBaseUrl = "https://<your-vercel-api-domain>";
```

임시 테스트만 할 때는 브라우저 콘솔에서 아래처럼 덮어쓸 수 있다.

```js
localStorage.setItem('budget.apiBase', 'https://<your-vercel-api-domain>');
location.reload();
```

## 확인 URL

API 단독 확인:

```text
https://<your-vercel-api-domain>/api/preview?kind=recipe&url=https%3A%2F%2Fyoutu.be%2FVIDEO_ID
```

정상 응답은 HTTP 200 JSON이며, 최소한 `ok`, `title`, `ingredients`, `steps` 필드를 포함한다.

앱 확인:

1. GitHub Pages 앱을 연다.
2. 레시피/장바구니 입력창에 YouTube Shorts URL을 붙여넣는다.
3. 제목, 썸네일, 재료, 조리순서가 자동으로 채워지는지 확인한다.
4. Instagram Reels는 자막 접근성이 낮으므로 페이지 메타데이터와 LLM 추론 품질에 따라 결과가 달라질 수 있다.

## 로컬 확인

프론트엔드:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run dev
```

API:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; $env:ALLOWED_ORIGIN='http://localhost:5501'; $env:GROQ_API_KEY='<your-key>'; npx.cmd vercel dev vercel-api --listen 3001
```

로컬 프론트에서 API를 연결하려면 브라우저 콘솔에 아래 값을 넣고 새로고침한다.

```js
localStorage.setItem('budget.apiBase', 'http://localhost:3001');
location.reload();
```
