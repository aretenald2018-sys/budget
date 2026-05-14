# GitHub Pages + Vercel API 브리지 계획

## 요청 원문

Vercel에 배포했던 내용들은 함수 갯수 한계 때문에 지우고, Vercel은 API만 처리하도록 붙인 뒤 그 결괏값을 GitHub Pages 프론트에서 받아오는 방식이 괜찮은지 검토한다. 더 나은 대안이 있으면 적용해도 된다.

## 이해한 내용

- 목표: GitHub Pages 정적 프론트는 유지하고, 레시피/상품 미리보기처럼 비밀키와 서버 fetch가 필요한 기능만 Vercel API로 분리한다.
- 비목표: 이번 계획에서는 NAS/Docker 운영, 전체 앱을 Vercel로 이전, 기존 GitHub Actions ingest/gmail pipeline 제거, BYOK 브라우저 LLM을 하지 않는다.
- 사용자 흐름: 사용자가 GitHub Pages 앱에서 Shorts/Reels/상품 URL을 붙이면 프론트가 Vercel API endpoint를 호출하고, Vercel은 LLM/API key를 숨긴 채 JSON preview만 반환한다.
- 데이터 가정: 현재 root `api/`는 GitHub Actions scripts와도 연결되어 있어 무작정 삭제하지 않는다. Vercel 함수 수 제한을 피하려면 Vercel project root를 별도 `vercel-api/`로 잡고, 그 안에 1개 gateway function만 둔다.
- 열려 있는 질문: 없음. 사용자가 더 나은 대안 적용을 허용했고, 현재 코드 구조상 API 전용 Vercel subproject가 가장 작은 변경이다.

## 코드 조사 결과

- repo root에는 `vercel.json`이 없다.
- root `api/`에는 `ingest`, `gmail-poll`, `client-parse`, `visual-search`, `market-symbol-search` 등 다수 endpoint가 있어 그대로 Vercel 배포하면 함수 수가 늘어난다.
- `choice/share-preview.js`는 `hasServerApi()`가 false면 `/api/*` endpoint를 빈 문자열로 돌려 GitHub Pages에서 서버 API 호출을 막는다.
- `utils/runtime.js`는 GitHub Pages와 `localhost:55xx`에서 서버 API를 false로 판정한다.
- 레시피 preview 핵심은 `api/_lib/recipe-preview.js`와 `api/market-symbol-search.js`의 `recipeUrl` branch에 있다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: “기존 root `api/`를 Vercel에 그대로 올릴 것인가, API 전용 최소 surface를 새로 만들 것인가?”
- 추천 답변: API 전용 최소 surface를 새로 만든다. 함수 수 제한, 보안 surface, 배포 책임을 줄일 수 있다.
- 사용자 답변: 직접 질문하지 않음. 요청에서 “더 나은 대안 있으면 적용”을 허용했고, 코드 조사로 root `api/` 전체 배포가 과하다는 점을 확인했다.
- 확정된 결정: `vercel-api/` 하위에 단일 gateway function을 만들고, Vercel project Root Directory를 `vercel-api`로 설정한다. GitHub Pages는 `BUDGET_API_BASE` 또는 빌드 config로 이 API base URL을 읽는다.
- 남은 가정: 사용자는 Vercel 계정과 env 설정 권한이 있다. 실제 Vercel project 삭제/생성은 로컬 코드 변경만으로 끝나지 않아 사용자가 대시보드 또는 CLI에서 수행해야 한다.

## 결정 기록

- 결정: root `api/` 폴더를 삭제하지 않는다.
- 이유: GitHub Actions와 기존 scripts가 root `api/_lib`와 endpoint들을 import한다. 삭제하면 SMS/Gmail/receipt pipeline 회귀 위험이 크다.
- 되돌릴 수 있는가: 예. Vercel API subproject는 별도 폴더라 제거해도 root 앱은 유지된다.

- 결정: Vercel에는 단일 gateway function만 배포한다.
- 이유: Vercel은 functions 사용량과 function 생성/배포 단위가 존재하고, 현재 root `api/` 전체를 배포하면 필요 없는 endpoint까지 노출된다. 단일 gateway는 함수 수 제한을 피하고 CORS/auth/rate limit을 한 곳에서 관리한다.
- 되돌릴 수 있는가: 예. 트래픽/기능이 늘면 endpoint를 분리할 수 있다.

- 결정: Cloudflare Workers는 2순위 대안으로 둔다.
- 이유: Workers는 매우 저렴하고 단일 worker 구조가 좋지만, 현재 Node/Vercel style 코드와 공유하기 어렵다. 첫 실행 비용은 Vercel subproject가 낮다.
- 되돌릴 수 있는가: 예. gateway contract를 유지하면 나중에 API base만 Cloudflare URL로 바꾸면 된다.

## 실행 슬라이스

### 슬라이스 1: API 브리지 설계와 프론트 endpoint 전환

- 상태: 계획 완료, 실행 대기
- 목표: GitHub Pages에서도 외부 API base URL을 통해 서버 preview API를 호출할 수 있게 한다.
- 범위:
  - `vercel-api/` 폴더를 추가하고 단일 gateway function을 둔다.
  - 우선 route는 `GET /api/preview?kind=recipe&url=...` 또는 `GET /api/recipe-preview?url=...` 중 하나로 제한한다.
  - gateway는 CORS allowlist, method guard, timeout, JSON response shape를 가진다.
  - GitHub Pages 프론트는 `window.BUDGET_API_BASE`, `localStorage`, 또는 정적 config 파일 중 하나로 API base URL을 읽는다.
  - `choice/share-preview.js`의 `recipePreviewEndpoint()`, 필요 시 `productPreviewEndpoint()`/`visualSearchEndpoint()`가 API base URL을 사용할 수 있게 한다.
  - API base가 없으면 현재처럼 정적 fallback을 유지한다.
  - 문서에 Vercel 대시보드 설정값을 남긴다: Root Directory `vercel-api`, env `GEMINI_API_KEY` 또는 `GROQ_API_KEY`, `ALLOWED_ORIGIN`, optional `CORS_ALLOW_LOCAL`.
- 예상 수정 파일:
  - `vercel-api/package.json`
  - `vercel-api/api/preview.js` 또는 `vercel-api/api/index.js`
  - `vercel-api/vercel.json`
  - `choice/share-preview.js`
  - `utils/runtime.js` 또는 신규 `utils/api-base.js`
  - `index.html`, `app.js` cache-busting query string
  - `docs/deploy-vercel-api.md` 또는 `docs/ai/` handoff
- 수정하지 말 것:
  - root `api/` 삭제
  - GitHub Actions backend workflow 삭제
  - Firebase/Gmail/SMS ingest 흐름 변경
  - 전체 앱을 Vercel hosting으로 이전
  - BYOK 입력 UI
- 구현 메모:
  - 단일 gateway function을 쓰면 Vercel 함수 수가 1개로 유지된다.
  - 코드 공유를 위해 root `api/_lib/recipe-preview.js`를 그대로 import하는 방식은 Vercel Root Directory 때문에 깨질 수 있다. 첫 구현은 `vercel-api` 안에 최소 recipe preview logic을 두고, 중복이 커지면 shared package로 정리한다.
  - Reels는 Instagram oEmbed 제한 때문에 완전 자동 파싱 API로 약속하지 않는다. API는 YouTube 중심 + Reels metadata/manual paste fallback으로 안내한다.
- 검증 방법:
  - `node --check vercel-api/api/preview.js`
  - `node --check choice/share-preview.js`
  - `npm.cmd run verify`
  - normal terminal에서 `npm.cmd run dev -- --host 127.0.0.1 --port 5501` 실행 후 API base 설정 상태로 레시피 URL paste flow 확인
  - Vercel 배포 후 `https://<vercel-api-domain>/api/preview?kind=recipe&url=<youtube-url>`가 HTTP 200 JSON을 반환하는지 확인
  - GitHub Pages URL에서 Network tab에 Vercel API 요청이 200이고, 메모/ingredients가 채워지는지 확인
- 완료 증거:
  - Vercel project가 root 앱이 아니라 `vercel-api`만 배포함
  - Vercel functions surface가 단일 gateway로 제한됨
  - GitHub Pages에서 Vercel API preview JSON을 받아 form에 반영함
  - API base 미설정/실패 시 기존 정적 fallback이 유지됨
- 다음 세션 시작 프롬프트:
  - 이 계획 문서를 읽고 슬라이스 1만 실행한다. root `api/`와 GitHub Actions workflow는 삭제하지 말고, Vercel API 전용 subproject와 프론트 endpoint 전환만 구현한다.

### 슬라이스 2: 배포/운영 검토

- 상태: 슬라이스 1 이후 진행
- 목표: 실제 Vercel 배포 설정과 GitHub Pages 연동이 비용/보안/회귀 측면에서 안전한지 리뷰한다.
- 범위:
  - Vercel project Root Directory가 `vercel-api`인지 확인한다.
  - env/secrets가 브라우저 번들에 들어가지 않는지 확인한다.
  - CORS allowlist가 GitHub Pages origin과 local dev만 허용하는지 확인한다.
  - 함수 timeout과 LLM 실패 응답이 UI fallback으로 연결되는지 확인한다.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-05-14-vercel-api-bridge-review.md`
  - 필요 시 `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 리뷰 중 새 endpoint 추가
  - NAS/Docker 전환
- 검증 방법:
  - 배포 URL HTTP 200/4xx 실패 케이스 확인
  - GitHub Pages 실제 paste flow 확인
- 완료 증거:
  - Vercel API 호출 성공/실패 모두 UI가 이해 가능한 상태로 표시됨
  - 비밀키 노출 없음

## Vercel 대시보드 작업 메모

- 기존 Vercel project를 계속 쓰려면 Project Settings에서 Root Directory를 `vercel-api`로 바꾼다.
- 기존 project가 root 전체를 계속 스캔하거나 꼬여 있으면 새 project `budget-api`를 만들고 Root Directory를 `vercel-api`로 지정하는 편이 안전하다.
- 기존 Vercel 배포 “내용 삭제”보다 더 중요한 것은 root `api/`가 배포 대상에 포함되지 않게 하는 것이다.
- GitHub Pages는 그대로 두고, API base URL만 새 Vercel domain으로 지정한다.

## 비용 판단

- Vercel Hobby부터 시작한다. 현재 목적은 저빈도 API preview이고, 전체 앱 hosting이 아니므로 Pro 유료 구독부터 갈 이유는 작다.
- Cloudflare Workers는 비용 면에서 더 싸게 갈 수 있지만, 기존 Node/Vercel 함수 구조와 공유 비용이 있어 2순위다.
- NAS/Docker는 브라우저 자동화/ffmpeg/yt-dlp/OCR 같은 무거운 파이프라인이 필요해질 때만 재검토한다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트,
오래된 캐시/서비스워커 이슈, UX 깨짐, secret 노출, CORS 과허용을 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 완료
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 `API 브리지 설계와 프론트 endpoint 전환`을 실행한다.
- 차단 질문: 없음
