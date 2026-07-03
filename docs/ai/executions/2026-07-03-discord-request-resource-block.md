# Discord 요청 리소스 차단 실행 기록

## 실행한 작업

- `C:\Users\USER\Desktop\patient\.env.local`에서 Discord 자동 처리 설정을 껐다.
- Windows 예약 작업 `Codex Discord Agent`, `Codex Discord Bridge`를 중지하고 비활성화했다.
- 현재 실행 중이던 `patient\scripts\discord-*` runner/worker/bridge 프로세스를 종료했다.
- `budgetproject` 앱 코드는 변경하지 않았다.

## 변경된 설정

- `DISCORD_BRIDGE_ROUTE_MODE=off`
- `DISCORD_BRIDGE_MESSAGE_CONTENT_INTENT=0`
- `DISCORD_BRIDGE_OUTBOX_RELAY=0`
- `DISCORD_AGENT_PROVIDER=off`
- `DISCORD_AGENT_REVIEWER=0`
- `DISCORD_AGENT_REVIEWER_PROVIDER=off`

## 검증

- 예약 작업 확인:
  - `Codex Discord Agent`: `Disabled`
  - `Codex Discord Bridge`: `Disabled`
- 프로세스 확인:
  - `discord-hidden-runner.vbs`, `discord-task-runner.mjs`, `discord-agent-worker.mjs`, `discord-development-request-bridge.mjs` 관련 프로세스 없음
- 설정 확인:
  - `.env.local`의 Discord route/message/outbox/agent/reviewer 플래그가 off/0으로 변경됨

## 남은 리스크

- 사용자가 `start-discord-agent.cmd`, `start-discord-bridge.cmd`를 직접 실행하면 브리지는 다시 시작될 수 있다. 다만 현재 설정상 agent/reviewer는 off라 Codex 작업은 실행되지 않는다.
- Discord bot token 자체는 유지했다. 완전한 봇 연결 차단이 필요하면 Discord Developer Portal에서 token revoke 또는 봇 제거가 별도 필요하다.
