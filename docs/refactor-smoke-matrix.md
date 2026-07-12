# 리팩토링 비-E2E 검증표

이번 앱 전체 리팩토링에서는 사용자 요청에 따라 브라우저, production, Android 실기기 E2E를 수행하지 않는다. 완료 판단은 아래 자동·정적 계약에 한정한다.

| 영역 | 비-E2E 검증 | 주요 계약 |
|---|---|---|
| 인증/앱 셸 | syntax/import/static guard | 공개 탭, 인증 탭, background sync 경계 |
| 홈/리포트 | report state·budget view 단위 테스트 | 기간 계산, 보상 snapshot, renderer/controller 분리 |
| 거래 | transaction state·calendar·editor 단위 테스트 | 필터 상태, delegated action, 저장 경계 |
| 공통 모달 | transaction modal binding 단위 테스트와 controller ownership 검사 | 재진입 listener 해제, 오래된 상세 로드 무효화, 계좌·카테고리 저장 경계 |
| 리뷰/정산 | state 단위 테스트와 정적 소유권 검사 | 미매칭 조회, 방향 필터, controller 분리 |
| 설정 | settings/reward/budget state·view 단위 테스트 | 예산·보상 상태, Android capture view 분리 |
| 재무 | projection·portfolio·editor·state 단위 테스트 | 계산 결정성, state/controller 분리 |
| 뉴스피드 | state·digest·view 단위 테스트 | pagination, fallback, delegated action |
| Android | schema/queue/중복/실패 보존 계약 테스트 | local queue, bridge, `data.js` 저장 경계 |
| 릴리스 | release contract·Pages build | 단일 releaseId stamp, APK metadata, artifact allowlist |
| 삭제 기능 | 정적 재유입 guard | 욕구·마인드뱅크·와인 셀러 런타임 부재 |

필수 명령은 `npm.cmd test`, `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check`다.
