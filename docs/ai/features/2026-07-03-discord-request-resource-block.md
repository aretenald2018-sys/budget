# Discord 요청 리소스 차단 계획

## 배경

- 사용자 요청: Discord로 들어오는 요청이 GPT/Codex 리소스를 쓰지 않게 차단한다.
- 확인 결과 Discord 자동화는 `budgetproject` 내부 앱 코드가 아니라 `C:\Users\USER\Desktop\patient`의 브리지/agent runner가 담당한다.
- 실행 중이던 예약 작업:
  - `Codex Discord Agent`
  - `Codex Discord Bridge`
- 실행 중이던 주요 프로세스:
  - `scripts\discord-task-runner.mjs agent`
  - `scripts\discord-task-runner.mjs bridge`
  - `scripts\discord-agent-worker.mjs`
  - `scripts\discord-development-request-bridge.mjs`

## 결정

- GPT/Codex 리소스 사용을 막기 위해 `agent worker`와 `bridge` 예약 작업을 중지하고 비활성화한다.
- 재시작되더라도 Codex가 실행되지 않도록 `patient/.env.local`의 Discord 관련 플래그를 off로 둔다.
- Discord 앱 자체는 종료하지 않는다. 일반 Discord 사용과 자동 개발 요청 처리 차단은 분리한다.

## 실행 범위

- 변경 대상:
  - `C:\Users\USER\Desktop\patient\.env.local`
  - Windows 예약 작업 `Codex Discord Agent`
  - Windows 예약 작업 `Codex Discord Bridge`
- 변경하지 않을 대상:
  - `budgetproject` 앱 코드
  - Discord 클라이언트 앱
  - Discord bot token 값
  - 기존 `docs/ai/inbox` 요청 기록

## 설정 변경

- `DISCORD_BRIDGE_ROUTE_MODE=off`
- `DISCORD_BRIDGE_MESSAGE_CONTENT_INTENT=0`
- `DISCORD_BRIDGE_OUTBOX_RELAY=0`
- `DISCORD_AGENT_PROVIDER=off`
- `DISCORD_AGENT_REVIEWER=0`
- `DISCORD_AGENT_REVIEWER_PROVIDER=off`

## 검증 계획

1. Windows 예약 작업 `Codex Discord Agent`, `Codex Discord Bridge`가 `Disabled`인지 확인한다.
2. `discord-hidden-runner.vbs`, `discord-task-runner.mjs`, `discord-agent-worker.mjs`, `discord-development-request-bridge.mjs` 관련 프로세스가 남아 있지 않은지 확인한다.
3. `patient/.env.local`에서 Discord agent/bridge 플래그가 off/0으로 바뀌었는지 확인한다.

## 다음 실행 슬라이스

- Slice 1: 즉시 차단
  - 예약 작업 중지 및 비활성화
  - 현재 실행 중인 bridge/agent 프로세스 종료
  - 재시작 방지용 `.env.local` 플래그 변경
  - 검증 결과 기록
