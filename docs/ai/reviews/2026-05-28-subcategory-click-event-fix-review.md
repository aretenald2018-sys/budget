# 상세분류 미지정 클릭 이벤트 보강 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-05-28-subcategory-click-event-fix.md`
- 요청 ID: `devreq_discord_1509472073414742107`
- 변경 범위: `생활비용` 상세 모달의 `상세분류 미지정` 요약 행 탭 이벤트 보강 및 JS cache-bust 갱신

## 리뷰 결과

차단 이슈 없음.

## 확인 내용

- `render-report.js`의 모달 위임 클릭 경로가 `closestReportActionTarget()` helper를 사용하도록 바뀌어, 이벤트 타깃이 Element가 아니어도 부모 Element에서 `[data-report-action]`을 찾는다.
- `report-category-modal`은 `click`과 비마우스 `pointerup`을 모두 처리하고, `shouldIgnoreRepeatedSubcategoryOpen()`으로 모바일 합성 click 중복 호출을 막는다.
- 상세분류 지정 모달의 취소/저장 위임 경로도 같은 helper를 사용해 동적 모달 내부 액션 탐색 방식을 통일했다.
- `index.html`, `app.js`, `render-home.js`의 JS cache-bust 문자열이 `20260528-subcategory-click-fix`로 갱신되어 배포 후 새 `render-report.js`를 강제로 로드한다.

## 검증

- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `node --check render-home.js`: 통과
- `git diff --check`: 통과
- `npm.cmd run verify`: 통과

## 남은 검증 갭

- not verified yet: 실제 Android 브라우저/WebView에서 `생활비용` 상세 모달의 `상세분류 미지정` 행을 탭했을 때 상세분류 지정 시트가 열리는지 직접 터치 검증은 이 환경에서 수행하지 못했다.
