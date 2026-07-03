# Discord 요청 리소스 차단 리뷰

## 결과

- Blocking issue 없음.
- 예약 작업이 `Disabled` 상태라 자동 재시작 경로가 막혔다.
- 관련 Node/VBS 프로세스가 남아 있지 않아 현재 세션에서 추가 Discord 요청을 처리할 worker가 없다.
- 재시작되더라도 `.env.local`의 agent/reviewer가 `off`라 GPT/Codex 실행 경로가 차단된다.

## 확인한 증거

- `Get-ScheduledTask -TaskName 'Codex Discord Agent','Codex Discord Bridge'` 결과 두 작업 모두 `Disabled`.
- `Get-CimInstance Win32_Process`에서 `patient\scripts\discord-hidden-runner.vbs`, `discord-task-runner.mjs`, `discord-agent-worker.mjs`, `discord-development-request-bridge.mjs` 매칭 프로세스 없음.
- `rg`로 확인한 `patient/.env.local` Discord 플래그:
  - route: `off`
  - message content intent: `0`
  - outbox relay: `0`
  - agent provider: `off`
  - reviewer: `0`
  - reviewer provider: `off`

## 검증 갭

- 실제 Discord에 새 메시지를 보내서 봇 무응답을 확인하지는 않았다. 프로세스/예약 작업/설정 레벨에서 차단 상태를 확인했다.
