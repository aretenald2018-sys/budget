# 거래 상세 환급/입력 컨트롤 미니멀 정리 계획

## 요청

거래 상세 모달에서 `실손/병원비 환급예정으로 처리` 영역을 위의 `다음에도 자동` 체크와 같은 가벼운 행 디자인으로 바꾸고, 표시 문구는 `환급예정`으로 줄인다. 기존 설명은 보이지 않는 본문 대신 물음표 도움말에 넣어 마우스오버/포커스 시 확인할 수 있게 한다. 카테고리, 금액 등 입력 컨트롤은 기존보다 낮고 덜 음영진 미니멀 스타일로 정리한다.

## 그릴 결과

- 핵심 질문: 환급 예정 기능의 긴 설명은 완전히 제거할지, 접근 가능한 도움말로 남길지?
- 답변/결정: 화면에는 `환급예정`만 남기고, 물음표 도움말의 `title`/tooltip 텍스트로 기존 설명을 제공한다.
- 핵심 질문: 입력 컨트롤 축소 범위는 앱 전체인지 거래 상세 모달 한정인지?
- 답변/결정: 요청 스크린샷의 거래 상세 모달 맥락에 맞춰 `#tx-edit-form` 내부 행/상세분류/메모 컨트롤만 조정한다. 설정 화면이나 다른 모달의 전역 입력 스타일은 건드리지 않는다.
- 남은 가정: 모바일 터치 환경에서는 hover가 없으므로 물음표 버튼에 `title`과 `aria-label`을 함께 두고, 키보드 포커스에도 CSS tooltip이 보이게 한다.

## 실행 슬라이스 1: 거래 상세 모달 컨트롤 정리

### 변경 범위

- `modals/tx-edit-modal.js`
  - 환급 체크 패널 마크업을 일반 inline checkbox 행으로 변경한다.
  - 표시 문구를 `환급예정`으로 통일한다.
  - 물음표 도움말 요소에 기존 설명을 담고 hover/focus에서 보이도록 클래스와 접근성 속성을 부여한다.
  - 체크 상태 변경 시 긴 문구로 되돌아가는 동적 라벨 갱신을 제거한다.
- `styles/20-records.css`
  - `.tx-refund-panel`을 카드형 음영 패널에서 `다음에도 자동`과 가까운 compact checkbox 행으로 바꾼다.
  - 거래 상세 내부 `.tds-input`, `.tds-select`, `.tds-textarea`, 상세분류 편집 컨트롤의 높이/패딩/배경을 줄인다.
  - 음영 배경 대신 얇은 border와 focus 상태로 입력 가능성을 표현한다.
- `style.css`, `index.html`, `app.js`, `modal-manager.js`
  - CSS/JS 변경이 운영 브라우저에 반영되도록 cache-bust 문자열을 갱신한다.
- `scripts/verify-project.mjs`
  - 환급 라벨/도움말/compact 스타일/cache-bust 계약을 정적 검증에 추가한다.

### 제외

- 환급 상태 저장 schema 변경
- 리포트/거래 목록의 환급 토글 UI 변경
- Android 위젯/실기기 확인
- 전역 입력 컴포넌트 리디자인

## 검증 계획

1. `node --check modals/tx-edit-modal.js`
2. `node --check scripts/verify-project.mjs`
3. `npm.cmd run verify`
4. `npm.cmd run pages:build`
5. `git diff --check`
6. production 배포 후 `Deploy GitHub Pages` workflow 성공과 `https://aretenald2018-sys.github.io/budget/` HTTP 200을 확인한다.
7. 운영 UI 증명 상태: 거래 상세 모달에서 환급 영역이 한 줄 `환급예정` 체크로 보이고, 물음표 도움말에 기존 설명이 있으며, 금액/카테고리/계좌/가맹점/메모 입력이 낮고 흰 배경+얇은 border 스타일로 보인다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-03-tx-detail-compact-refund-controls.md`의 실행 슬라이스 1을 구현한다. 변경 후 검증, 리뷰 문서, production 배포 상태까지 남긴다.
