# 오늘의 적립 카드 디자인 원복 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-reward-card-design-restore.md`
- 실행 슬라이스: `오늘의 적립 카드만 기존 홈 디자인에 맞춤`
- 실행 일시: 2026-07-02 KST

## 구현

- 홈 전체 다크 카드 확장 스타일을 제거했다.
  - `#tab-home .home-variable-panel`
  - `#tab-home .fixed-cost-panel`
  - `#tab-home .dev-idea-card`
- `오늘의 적립` 카드만 기존 홈 디자인 시스템에 맞췄다.
  - 배경: `var(--surface)`
  - 테두리: `1px solid var(--border)`
  - 라운드: `16px`
  - 텍스트: `var(--text)`, `var(--text-secondary)`
  - 게이지: 기존 홈 게이지와 같은 `var(--grad-bar)`
- `style.css`, `index.html`의 CSS cache bust 문자열을 `20260702-reward-card-restore`로 갱신했다.
- 보상 산식, 설정 저장, 포인트 명칭, 포인트 장부 로직은 변경하지 않았다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- `_site` 문자열 확인
  - `20260702-reward-card-restore` 반영 확인.
  - `.home-reward-card` 반영 확인.
  - 이전 다크 확장 색상 `#20262d`, `#f3b7c8`, `--reward-card-*` 제거 확인.

## 운영 확인

- 커밋: `62a3181 Restore reward card design`
- Pages workflow: `Deploy GitHub Pages` run `28576972467` 성공.
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
- 운영 cache bust: `style.css?v=20260702-reward-card-restore`
- 운영 홈 확인:
  - `오늘의 적립`: 배경 `rgb(255, 255, 255)`, 텍스트 `rgb(25, 31, 40)`, radius `16px`, 게이지 `linear-gradient(90deg, rgb(122, 140, 255), rgb(179, 136, 255))`.
  - `이번 2주 변동비`: 배경 `rgb(255, 255, 255)`, 텍스트 `rgb(25, 31, 40)`, radius `16px`, 게이지 기존 보라 그라데이션.
  - `이번 달 고정비`: 배경 `rgb(255, 255, 255)`, 텍스트 `rgb(25, 31, 40)`.
  - `Dev Ideas`: 배경 `rgb(255, 255, 255)`, 텍스트 `rgb(25, 31, 40)`.
