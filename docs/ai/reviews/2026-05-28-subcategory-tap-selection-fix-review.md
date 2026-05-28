# 상세분류 터치 선택 방지 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-05-28-subcategory-tap-selection-fix.md`
- 변경 파일: `styles/20-records.css`, `style.css`, `index.html`, `docs/ai/NEXT_ACTION.md`

## 결과

- 차단 이슈 없음.
- `button.report-subcategory-row.actionable`과 내부 텍스트에 `-webkit-touch-callout: none`, `-webkit-user-select: none`, `user-select: none`, `touch-action: manipulation`이 적용되어 스크린샷의 Android 텍스트 선택 툴바 원인을 직접 막는다.
- 일괄 분류 시트의 `전체 선택` 라벨과 거래 체크 행에도 같은 계열의 선택 방지 스타일이 적용되어 체크 토글 중 텍스트 선택이 다시 생길 가능성을 낮췄다.
- `style.css`와 `index.html`의 CSS 캐시 버스트 문자열이 `20260528-subcategory-tap-fix`로 갱신되어 정적 호스팅 캐시 반영 경로가 맞다.

## 검증

- `npm.cmd run verify` 통과: `verify-project passed (96 JS files checked).`
- `rg`로 캐시 버스트 문자열과 `user-select`/`touch-action` 규칙 반영 확인.

## 남은 리스크

- not verified yet: 프로젝트 규칙상 sandbox에서 장기 dev server를 띄워 모바일 UI 검증 완료로 주장하지 않았다.
- 실제 확인은 정상 터미널에서 `npm.cmd run dev` 실행 후 Android 브라우저/WebView에서 `상세분류 미지정` 행 탭/길게 누르기, 분류 시트 열림, 텍스트 선택 툴바 미노출을 확인해야 한다.
