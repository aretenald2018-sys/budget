# 상세분류 지정 확인 버튼 노출 수정 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-06-06-subcategory-confirm-button-visible.md`
- 요청 ID: `devreq_discord_1512617813095747604`
- 변경 범위: 상세분류 지정 시트 확정 버튼 문구/모바일 액션 레이아웃/cache-bust 갱신

## 리뷰 결과

차단 이슈 없음.

## 확인 내용

- `render-report.js`의 상세분류 지정 시트는 기존 `save-subcategory-classifier` 액션과 `saveSubcategoryClassifier()` 저장 경로를 그대로 사용한다.
- 확정 버튼 문구는 `확인`으로 줄였고, 접근성 라벨은 `선택 거래 저장`을 유지했다.
- `styles/20-records.css`의 `@media (max-width: 420px)`가 더 이상 액션 버튼을 1열로 쌓지 않는다. 모바일에서도 `취소`와 `확인`이 같은 줄에 표시된다.
- `style.css`, `index.html`, `app.js`, `render-home.js`의 cache-bust 문자열이 `20260606-subcategory-confirm`으로 갱신됐다.
- `sw.js` 파일이 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 검증

- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `node --check render-home.js`: 통과
- `npm.cmd run verify`: 통과
- `git diff --check`: 통과

## 남은 검증 갭

- not verified yet: 인앱 브라우저 `iab` 세션이 없어 브라우저 플러그인 확인을 수행하지 못했고, 로컬 `playwright`/`jsdom`도 설치되어 있지 않았다.
- 배포 후 실제 로그인 앱에서 `상세분류 미지정` -> `상세분류 지정` 시트를 열어 하단에 `취소`와 `확인`이 함께 보이고 `확인`이 저장 동작으로 이어지는지 확인해야 한다.
