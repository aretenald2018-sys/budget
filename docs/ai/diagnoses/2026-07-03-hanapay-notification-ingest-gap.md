# 하나Pay 결제 알림 미등록 진단

## 증상

- 첨부 알림: `하나Pay`, `2026-07-03 08:40 KST`, `(결제) 2,200원`, `씨유문정엠스테이트점`.
- 앱 거래 목록에 해당 거래가 자동 등록되지 않았다.

## 재현/확인

- GitHub Actions `Budget Backend Jobs`에서 `2026-07-03 08:40 KST` 전후 `repository_dispatch` / `budget_ingest` 실행이 없었다.
- 운영 public APK는 native notification listener가 빠진 안전형 APK이므로, 현재 자동 수집 기본 경로는 MacroDroid다.
- 로컬 parser에 같은 본문을 넣으면 기존 코드는 deterministic parser를 통과하지 못하고 Gemini 경로로 떨어졌다. 로컬 secret이 없으면 `GEMINI_API_KEY env 미설정`으로 재현됐다.

## 원인 가설과 판정

1. MacroDroid 또는 native collector가 서버에 이벤트를 보내지 않았다.
   - 가능성 높음. 해당 시각의 `repository_dispatch` 실행이 없다.
2. 서버 raw에는 왔지만 parser가 skip/failed 했다.
   - 이번 Actions 기준으로는 반증됨. raw ingest workflow 자체가 없었다.
3. 같은 거래가 이미 다른 날짜/카테고리로 저장됐다.
   - 현재 로컬에는 Firestore admin secret이 없어 직접 조회하지 못했다. 다만 workflow 실행 부재 때문에 1번이 우선 원인이다.
4. 하나Pay 문구가 parser 지원 범위 밖이다.
   - 확인됨. `(결제) 2,200원 ... / 신용(...) / 07.03 08:40 / 누적이용금액 ...` 형식은 기존 `승인/취소` 중심 deterministic parser에 걸리지 않았다.

## 결론

이번 미등록은 수집 이벤트가 서버에 도착하지 않은 문제가 1차 원인이다. 동시에, 같은 형식이 서버에 도착해도 Gemini에 의존하므로 안정성이 낮다. 따라서 하나Pay 결제 알림 형식을 deterministic parser에 추가하고, 이번 누락 건은 운영 ingest workflow로 수동 등록한다.
