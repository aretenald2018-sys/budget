# 앱 전체 리팩토링 슬라이스 5 리뷰

## 결론

- 슬라이스 5 완료. 브라우저 inline handler를 0건으로 만들고 동적 UI를 feature별 delegated event로 전환했다.
- 직접 `window.*`에 할당하는 공개 API는 13개만 명시적 allowlist로 관리하며, 신규 노출과 오래된 allowlist를 verifier가 모두 실패시킨다.
- 3,706줄의 `styles/60-urge.css`를 shell, settings, report/home, finance 소유 파일로 분리했다. 시각 재디자인이나 저장 계약 변경은 하지 않았다.
- 슬라이스 6 서버 API와 GitHub Actions 서비스 계층 분리로 진행할 수 있다.

## 변경 경계

- `features/finance/events.js`, `features/settings/events.js`, `features/transactions/events.js`, `features/wine-cellar/events.js`: feature root의 click/change를 위임 처리한다.
- `render-report.js`, `render-tx.js`, `render-finance.js`, `render-settings.js`, `render-review.js`, `render-settle.js`, urge/wine renderer: inline event 문자열을 `data-*` action으로 바꾸고 내부 controller를 호출한다.
- `modal-manager.js`: 공통 취소 버튼과 overlay backdrop을 delegated dismiss로 처리한다.
- `scripts/verify/checks/static-checks.mjs`: 전 browser JS/HTML inline event 0건과 승인된 `window` API 파일/이름을 검사한다.
- `styles/60-shell.css`, `styles/features/settings.css`, `styles/features/report-home.css`, `styles/features/finance.css`: 기존 혼합 CSS를 실제 소유권으로 분리했다.
- `styles/00-foundation.css`: `button.tx-row`의 브라우저 기본 border/font/background 누출을 막았다.

## 운영 리뷰에서 발견하고 수정한 문제

- 정산 화면이 `type + occurredAt` Firestore 복합 인덱스를 요구해 로드 실패했다. 최근 6개월을 날짜 단일 인덱스로 읽고 settlement type을 클라이언트에서 필터하도록 바꿨다.
- 360px 홈의 보상 포인트 메타 마지막 줄이 viewport보다 16px 넓었다. 모바일에서 메타를 두 줄 block으로 배치하고 마지막 줄을 말줄임 처리해 수평 overflow를 0으로 만들었다.
- 두 문제 모두 verifier 계약을 추가하고 `20260712-event-css-ownership-r2` cache contract로 재배포했다.

## 계약과 회귀 방지

- browser source의 `onclick`, `onchange`, `onsubmit`, `onkeydown`, `oninput`은 허용하지 않는다.
- `window` 공개 API는 app shell 6개, modal 경계 6개, 감각뱅크 진입 1개만 허용한다.
- settings/report-home/finance CSS는 다른 feature의 selector token을 포함할 수 없고 import 순서도 고정된다.
- `styles/60-urge.css` 재생성을 금지하고 신규 feature CSS가 Pages artifact에 포함되는지 검사한다.
- app/home/settings의 report module singleton URL과 기존 data/modal cache 계약을 유지한다.

## 검증

- `npm.cmd test`: 43/43 통과.
- `npm.cmd run verify`: 통과, 147개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run verify:registered-recipes`: 9개 등록 레시피 검사 완료.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- GitHub Pages workflow [29189251453](https://github.com/aretenald2018-sys/budget/actions/runs/29189251453): build/deploy 성공.
- production `https://aretenald2018-sys.github.io/budget/`와 신규 shell/settings/report-home/finance CSS: HTTP 200.
- 최종 새 production 탭 console warning/error 0건.
- 로그인된 production UI에서 다음을 실제 조작했다.
  - 홈: 포인트 사용 modal 첫 viewport, Escape 닫기, 카테고리 drill-down 369,410원·16건, 상세분류 미지정 9건.
  - 재무: 시나리오 관리자, 실적 업데이트 sheet 열기/닫기, 자산/포트폴리오 panel 전환.
  - 거래: 달력과 거래 목록, 실제 `BUTTON.tx-row`의 폭 392px·상/좌 border 0·하단 border 1px, 상세 modal 열기/취소.
  - 설정: 총 예산 2,550,000원, 14개 예산/rhythm control, custom 포인트 4개, 설정→검토 delegated 이동.
  - 정산: 최근 6개월 5건 정상 로드, 이벤트/상대 누적 표시, 전체 mode 활성화.
  - 모바일 360px: `body.scrollWidth === viewport`, overflow 요소 0건.
- 와인 셀러는 현재 직접 진입 bottom-nav가 없어 view/event test와 Pages artifact 계약으로 확인했다.

## 커밋

- `fd70f66` Delegate report feature events
- `b1a6906` Delegate transaction list events
- `431d248` Delegate common modal dismissal
- `7958d19` Delegate finance feature events
- `dc15c9e` Delegate settings shell actions
- `cba1375` Enforce delegated browser events
- `5244028` Split feature stylesheet ownership
- `fabb0c6` Fix settlement fallback and mobile reward overflow

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 6에서 HTTP handler, service/use-case, 외부 adapter, env/error 정책을 분리하고 fixture 기반 idempotency 검증을 추가한다.
