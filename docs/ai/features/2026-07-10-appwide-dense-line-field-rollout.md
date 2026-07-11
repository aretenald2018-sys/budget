# 전면 입력 밀도 표준화

- 상태: `planned_waiting_for_execution`
- 상세 실행 계획: `.omo/plans/2026-07-10-appwide-dense-line-field-rollout.md`
- ULW 세션: `.omo/ulw-loop/input-system-rollout-20260710/`

## 요청

보상 적립은 하나의 명확한 카드 안에 두되, 카테고리 수정 sheet를 포함한 modal과 앱 전반의 text/number/select 입력을 기존 dense line-field 표준으로 통일한다.

## 확정 설계

- 전역 `.tds-input`은 유지하고 `.tds-form--line` context에서만 40px·투명·하단 1px·focus-visible 규칙을 적용한다.
- `.tds-form-card`는 관련 form의 바깥 위계만 표현한다. 보상 적립은 기존 `settings-row` outer card를 복원하며 내부 포인트/daily group에는 새 카드를 만들지 않는다.
- modal은 `#modals-container` 밖에 있으므로 settings tab selector가 아니라 명시적인 form opt-in으로 적용한다.
- 로그인, URL+CTA capture, file input, checkbox/radio/toggle/segmented는 그대로 유지한다.

## 실행 slice

1. clean worktree와 RED fixture
2. 공용 primitive·문서화
3. reward/category/account 및 transaction/report
4. finance와 남은 inline editor
5. 전체 visual QA·리뷰·Pages 배포

## 실행 전제

이 문서는 계획 승인 후 작성되었다. 구현은 사용자의 명시적 `구현시작` 또는 `$start-work` 후 첫 slice부터 수행한다. 기존 root worktree의 Android/GPS 등 무관한 dirty change는 절대 stage하거나 되돌리지 않는다.
