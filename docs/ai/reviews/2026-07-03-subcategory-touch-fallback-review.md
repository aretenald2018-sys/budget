# 상세분류 미지정 터치 fallback 리뷰

## 리뷰 결과

문제 없음.

## 확인한 점

- `render-report.js`의 일반 `click` 경로는 즉시 `openSubcategoryClassifier()`를 호출한다.
- 터치 `pointerup` 경로는 중첩 모달을 즉시 열지 않고 timer만 예약하므로 Android 합성 `click`이 새 overlay를 닫는 충돌을 피한다.
- `click`/키보드 경로 진입 시 예약된 pointer fallback을 취소한다.
- `index.html`은 `app.js?v=20260703-data-auth-singleton` 접두를 유지해 인증 싱글턴 검증 규칙을 깨지 않는다.
- `app.js`와 `render-home.js`는 새 `render-report.js?v=20260703-subcategory-touch-fallback`를 요청한다.

## 추가 리뷰: `devreq_discord_1509480880790569112`

문제 없음.

## 추가 확인한 점

- `render-report.js`는 `상세분류 미지정` 액션 대상에서만 `selectstart`/`contextmenu` 기본 동작을 막는다.
- 기존 `click`/키보드 경로는 즉시 `openSubcategoryClassifier()`를 호출하고, 터치 `pointerup`은 지연 fallback만 예약한다.
- `index.html`, `app.js`, `render-home.js`는 `20260703-subcategory-select-guard` cache-bust로 새 `render-report.js`를 요청한다.
- 커밋 `90b1251`를 `main`에 push했고 `Deploy GitHub Pages` run `28635431143`, `Validate` run `28635431162`가 성공했다.
- 운영 URL은 HTTP 200이고 운영 배포본에서 `preventSubcategoryTextSelection`, `selectstart`, `contextmenu`, `scheduleSubcategoryPointerFallback` 문자열을 확인했다.

## 검증

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site/index.html`, `_site/app.js`, `_site/render-home.js`, `_site/render-report.js` 정적 확인: 통과
- 추가 검증: `node --check render-report.js`, `node --check app.js`, `node --check render-home.js`, `git diff --check`, `npm.cmd run verify`, `npm.cmd run pages:build` 통과
- staged 최소 패치 검증: `git diff --cached --check`, `git show :render-report.js | node --input-type=module --check`, `git show :app.js | node --input-type=module --check`, `git show :render-home.js | node --input-type=module --check` 통과
- GitHub Actions: `Deploy GitHub Pages` 성공, `Validate` 성공
- 운영 정적 확인: `https://aretenald2018-sys.github.io/budget/?deploy=90b1251` HTTP 200, 새 cache-bust와 보강 함수 확인

## 남은 위험

not verified yet: 인증된 실제 Android/WebView 운영 데이터 화면에서 `생활비용` 상세 모달의 `상세분류 미지정` 터치가 `상세분류 지정` 시트를 열고 텍스트 선택 메뉴가 뜨지 않는지까지는 이 환경에서 확인하지 못했다.
