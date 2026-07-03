# 2026-07-02 하나Pay 14:21 알림 미수집 진단

## 증상

- 2026-07-02 14:21 KST 하나Pay 알림:
  - `(결제) 2,800원`
  - `씨유문정엠스테이트점`
  - `07.02 14:21`
- 사용자는 "로그 자체에 아무것도 안 잡힌다"고 보고했다.

## 확인한 근거

- 첨부 스크린샷 기준 14:23 KST에 결제 알림은 Android 알림창에 존재한다.
- MacroDroid 매크로 목록에서 알림 수집 매크로 `2번`의 최종 실행은 `3시간 전`으로 표시된다.
- 같은 화면에서 SMS 수집 매크로 `1번`의 최종 실행은 `22시간 전`이다.
- GitHub Actions 확인:
  - `gh run list -R aretenald2018-sys/budget --workflow budget-backend.yml --event repository_dispatch --limit 20`
  - 결과: `[]`
  - 즉 최근 `repository_dispatch` 기반 `budget_ingest` 실행이 보이지 않는다.
- `Budget Backend Jobs` 최근 실행은 2026-07-02 10:54 KST 전후의 `workflow_dispatch`와 10:30 KST `schedule`이며, 14:21 KST 알림과 대응되는 run이 없다.

## 판단

이번 건은 앱 표시/파서 문제가 아니라 MacroDroid 트리거 단계에서 멈춘 가능성이 가장 높다.

특히 MacroDroid 알림 매크로의 트리거 요약이 `알림을 받으면 (전화 및 메시지 저장소, 설...)`로 보이며, 첨부 알림의 발신 앱은 `하나Pay`다. 따라서 `하나Pay`가 알림 수집 대상 앱 목록에 포함되지 않았거나, 해당 알림 채널이 MacroDroid 알림 트리거 조건에서 제외되어 매크로가 실행되지 않은 것으로 보인다.

매크로가 실행되지 않았기 때문에 HTTP POST 액션도 실행되지 않고, 그 결과 GitHub Actions/Firestore raw log에도 아무것도 남지 않는다.

## 반증 방법

1. MacroDroid `2번` 매크로의 트리거 앱 목록에 `하나Pay`가 포함되어 있는지 확인한다.
2. MacroDroid 시스템 로그에서 2026-07-02 14:21 KST 전후 `2번` 매크로 실행 로그가 있는지 확인한다.
3. `2번` 매크로에서 테스트 실행을 눌렀을 때 HTTP 응답 코드가 GitHub `repository_dispatch`라면 `204`, `/api/ingest` 계열이면 `200` 계열로 나오는지 확인한다.
4. 알림 수집 대상에 `하나Pay`를 추가한 뒤 작은 결제 알림 또는 테스트 알림을 발생시켜 `Budget Backend Jobs` run 또는 raw message 생성 여부를 확인한다.

## 복구

이 알림은 서버 raw에 도착하지 않았으므로 pending 재처리로는 복구되지 않는다. 복구하려면 알림 본문을 수동 `workflow_dispatch` / `mode=ingest` payload로 재전송해야 한다.
