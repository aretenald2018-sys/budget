# 상세분류 미지정 터치 fallback 실행

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-subcategory-touch-fallback.md`
- 요청: `devreq_discord_1509472073414742107`
- 추가 요청: `devreq_discord_1509480880790569112`
- 실행 슬라이스: 터치 `pointerup` fallback 지연 처리 및 텍스트 선택 방지 보강

## 변경 내용

- `render-report.js`
  - `pointerup`에서 즉시 `openSubcategoryClassifier()`를 호출하지 않게 했다.
  - `pointerup`은 fallback timer만 예약하고, 정상 `click`/키보드 입력이 들어오면 예약을 취소한다.
  - `click`이 누락되는 터치 환경에서만 420ms 뒤 `상세분류 지정` 시트를 열게 했다.
- `index.html`, `app.js`, `render-home.js`
  - 새 `render-report.js`가 로드되도록 cache-bust 문자열을 `20260703-subcategory-touch-fallback`로 연결했다.
  - `index.html`은 검증 규칙 때문에 `app.js?v=20260703-data-auth-singleton` 접두를 유지하고 `cb=20260703-subcategory-touch-fallback`를 추가했다.
- `render-report.js`
  - 추가 요청에서 확인된 Android 텍스트 선택 UI를 막기 위해 `상세분류 미지정` 액션 대상의 `selectstart`/`contextmenu` 기본 동작을 차단했다.
- `index.html`, `app.js`, `render-home.js`
  - 추가 보강이 포함된 `render-report.js`가 로드되도록 cache-bust 문자열을 `20260703-subcategory-select-guard`로 갱신했다.
- `docs/ai/diagnoses/2026-07-03-subcategory-touch-fallback.md`
- `docs/ai/features/2026-07-03-subcategory-touch-fallback.md`

## 검증

- `npm.cmd run verify` 통과
- `npm.cmd run pages:build` 통과
- `_site` 산출물에서 새 cache-bust와 `scheduleSubcategoryPointerFallback()` 포함 확인

## 배포

not verified yet: 운영 배포는 수행하지 못했다. 작업 전부터 있던 미커밋 변경이 `render-report.js`, `render-home.js`, `style.css` 등 여러 파일에 섞여 있어 이 상태로 커밋/푸시하면 unrelated 변경까지 배포될 수 있다.
