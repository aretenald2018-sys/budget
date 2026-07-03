# 2주 시작일 설정 버튼 축소 계획

## 요청

- Discord 요청 ID: `devreq_discord_1510798058965831811`
- 요청자: 피노
- 내용: 홈 화면의 `2주 시작일` 버튼이 화면을 많이 차지하므로 `2주/한달` 토글 옆에 작은 설정 버튼을 두고, 클릭 시 모달에서 시작일을 설정하게 변경한다.

## 그릴 결과

- 핵심 질문: 시작일 설정을 홈 화면의 큰 독립 버튼으로 계속 노출할지, 토글 옆 보조 액션으로 숨길지?
- 결정: 토글 옆에 작은 설정 아이콘 버튼만 노출하고, 상세 설정은 모달에서 처리한다.
- 근거: 시작일은 자주 쓰는 값이 아니므로 1차 화면 공간을 차지할 필요가 낮다. 반면 현재 기간 전환 토글 근처에 두면 관련성은 유지된다.
- 남은 가정: 설정 대상은 홈 리포트 카드의 2주 기준 시작일이며, 저장 방식은 기존 `appSettings.biweeklyStartDate`와 localStorage fallback을 유지한다.

## 현재 코드 확인

- `render-report.js`에는 이미 `homeMode`일 때 `report-mode-tabs` 옆에 `.home-cycle-settings-btn`을 렌더링하는 구조가 있다.
- 같은 파일에 `home-cycle-settings-modal`을 동적으로 만들고 `biweeklyStartDate`를 저장하는 흐름이 있다.
- `styles/60-urge.css`에는 설정 버튼을 34px 원형 버튼으로 제한하는 스타일과 모달 폼 스타일이 있다.
- 전체 검색 결과, 화면을 크게 차지하는 별도 `2주 시작일` 버튼은 남아 있지 않다.

## 실행 슬라이스

### Slice 1 - 현 구현 고정 및 검증

- 상태: 구현 완료, 명령 검증 통과, production 배포/운영 UI 검증은 unrelated dirty worktree 때문에 미완료
- 범위:
  - `render-report.js`의 토글 옆 설정 버튼과 모달 설정 흐름을 확인한다.
  - `styles/60-urge.css`의 작은 설정 버튼/모달 스타일을 확인한다.
  - 필요한 경우에만 최소 앱 코드 보완을 한다.
- 제외:
  - 2주 기간 계산 로직 변경
  - 설정 저장 스키마 변경
  - 홈 리포트 카드의 다른 지표/보상 카드 리디자인
  - 기존 대기 중인 Android 알림 수집 리빌드 리뷰

## 검증 계획

1. `npm.cmd run verify`
2. `npm.cmd run pages:build`
3. UI 확인 대상:
   - 홈 화면 리포트 카드에서 `이번 2주` / `이번 달` 토글 옆에 작은 설정 버튼만 보인다.
   - 설정 버튼을 누르면 `2주 시작일 설정` 모달이 열린다.
   - 날짜 선택, 저장, 닫기 흐름이 동작한다.
4. 배포:
   - 의도한 변경만 커밋/푸시할 수 있으면 GitHub Pages 배포를 트리거한다.
   - unrelated dirty worktree 때문에 안전하게 배포할 수 없으면 `not verified yet`와 차단 사유를 남긴다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-03-biweekly-start-settings-modal.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-biweekly-start-settings-modal-review.md`
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- not verified yet: production 배포와 운영 UI 클릭 검증은 unrelated dirty worktree 때문에 미완료

## 다음 세션 자동 프롬프트

`docs/ai/features/2026-07-03-biweekly-start-settings-modal.md`의 Slice 1을 실행하고, 변경 파일과 검증 결과를 기준으로 리뷰한다.
