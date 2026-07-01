# 홈 CSS 복구 및 토스 김태우 제외 실행

## 실행 범위

- 계획 1: `docs/ai/features/2026-07-01-home-pre-choice-css-restore.md`
- 계획 2: `docs/ai/features/2026-07-01-toss-kim-taewoo-calendar-exclusion.md`
- 사용자 요청: 이 대화 스레드에서 아직 구현하지 않은 홈 디자인 복구와 `토스 김태우` 자전거래 캘린더 제외를 모두 구현하고 배포한다.

## 변경 내용

- `styles/60-urge.css`에서 홈 최상단 기간 카드의 flex 레이아웃, 홈 hero 토글, 설정 버튼, 고정비 카드 행/폰트 규칙을 탭 삭제 이전 기준으로 복구했다.
- `index.html`, `style.css`, `app.js`, 관련 화면 모듈의 cache-busting query를 `20260701-thread-complete` / `20260701-toss-kim-taewoo`로 갱신했다.
- `utils/self-transfer.js`를 추가해 `토스 김태우` `transfer_out`만 자전거래로 판정하는 공통 helper를 만들었다.
- `data.js`의 `isBudgetExcluded(tx)`와 `saveTransaction(tx)`에 공통 helper를 적용해 기존 거래는 동적 제외, 신규 수동 저장 거래는 제외 필드 저장이 되게 했다.
- `api/_lib/auto-ingest.js`와 `scripts/reprocess-pending-raw.mjs`에 같은 helper를 적용해 신규/재처리 ingest 경로도 제외 필드를 저장하게 했다.
- `scripts/export-calendar-csv.mjs`도 같은 helper를 사용해 캘린더 CSV 산출물에서 `토스 김태우` daily spend가 빠지게 했다.
- `scripts/verify-project.mjs`에 `토스 김태우`은 제외되고 `토스 김윤슬`, `토스 경찰청＿`, `토스페이먼츠`는 제외되지 않는 fixture를 추가했다.

## 검증

- `npm.cmd run verify` 통과.
- repo root에 `sw.js` / `STATIC_ASSETS` / `CACHE_VERSION` 정의는 없어 서비스워커 캐시 버전 갱신 대상은 없었다.
- 실제 로그인된 홈/거래 화면 시각 검증은 로컬 dev server를 사용자가 정상 터미널에서 띄워 확인해야 한다.

## 배포 전 메모

- 커밋에는 기존 사용자 작업으로 보이는 무관한 변경(`.github/workflows/budget-backend.yml`, `scripts/github-recipe-sync.mjs`, 기존 미추적 산출물 등)을 포함하지 않는다.
