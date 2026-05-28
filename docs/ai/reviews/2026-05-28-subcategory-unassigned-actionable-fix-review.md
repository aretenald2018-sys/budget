# 상세분류 미지정 텍스트 행 수정 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-05-28-subcategory-unassigned-actionable-fix.md`
- 요청 ID: `devreq_discord_1509480880790569112`
- 변경 범위: 카테고리 상세 모달의 `상세분류 미지정` 요약 행 버튼 렌더링 문맥 명시 및 JS cache-bust 갱신

## 리뷰 결과

차단 이슈 없음.

## 확인 내용

- `openReportCategoryTxs()`가 `subcategorySummaryHtml(txs, { actionableUnassigned: true })`를 넘겨 카테고리 상세 모달의 미지정 행을 전역 `STATE.activeDrill` 상태와 무관하게 `button.report-subcategory-row.actionable`로 렌더링한다.
- `openReportReimbursementTxs()`는 `actionableUnassigned: false`를 넘겨 환급 모달의 요약 행이 의도치 않게 분류 버튼으로 바뀌지 않는다.
- 기존 `click`/비마우스 `pointerup` 위임 처리와 `openSubcategoryClassifier()` 연결은 그대로 유지된다.
- `index.html`, `app.js`, `render-home.js`의 JS cache-bust 문자열이 `20260528-subcategory-actionable-fix`로 갱신되어 새 `render-report.js`를 다시 요청한다.
- `sw.js` 파일이 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 검증

- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `node --check render-home.js`: 통과
- `npm.cmd run verify`: 통과
- `git diff --check`: 통과

## 남은 검증 갭

- not verified yet: 실제 Android 브라우저/WebView에서 `생활비용` 상세 모달의 `상세분류 미지정` 행을 탭했을 때 `상세분류 지정` 시트가 열리는지는 이 환경에서 직접 확인하지 못했다.

