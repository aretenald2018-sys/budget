# 리팩토링 사용자 흐름 검증표

대상 URL: `https://aretenald2018-sys.github.io/budget/`

자동 검사와 HTTP 200만으로 UI 슬라이스를 완료 처리하지 않는다. 관련 화면을 수정한
슬라이스는 아래 흐름을 실제 모바일 viewport에서 조작하고, 결과와 workflow run을
해당 review 문서에 남긴다.

| 영역 | 필수 사용자 흐름 | 확인할 상태 |
|---|---|---|
| 인증/앱 셸 | 로그인 → 탭 이동 → 로그아웃 | 인증 전 공개 탭, 인증 후 header/tab, 새로고침 상태 |
| 홈/리포트 | 2주/월 전환 → 카테고리 drill-down → 거래 상세 | 기간 합계, 게이지, modal 첫 viewport, 뒤로가기 |
| 보상 | 포인트 항목 선택 → 사용 등록 → 수정 → 삭제 | 잔액, 음수 잔액, Android widget snapshot |
| 거래 | 월 이동 → 날짜 선택 → 거래 추가/편집 → 환급 토글 | 필터 유지, 캘린더 금액, 저장 후 목록 반영 |
| 리뷰/정산 | 검토 항목 편집 → 거래 연결 → 정산 확인 | 미분류/미매칭 수량과 저장 결과 |
| 설정 | 예산/카테고리/계좌 편집 → 저장 | modal mount, 입력 상태, 저장 후 홈 반영 |
| 재무 | 패널 이동 → 차트 확인 → 자산/시나리오 편집 | SVG/tooltip, 편집 sheet, 저장 후 재계산 |
| 욕구/마인드뱅크 | 욕구 입력 → 대안/결과 → 보관함 이동 | 단계 상태, 저장, wine cellar 진입 |
| 뉴스피드 | 공개 상태 → 로그인 상태 → 새로고침/복사 | snapshot fallback, pagination, clipboard 상태 |
| Android | 알림/SMS 수신 → 앱 열기 → queue flush | 중복 방지, 실패 보존, 거래/캘린더 표시 |
| 릴리스 | `release.json` → Pages workflow → production asset | release ID, APK metadata, artifact allowlist, 최신 query string |

공통으로 native select/checkbox가 의도치 않게 노출되지 않는지, 버튼의 touch/keyboard
동작이 같은지, CSS/JS가 최신 cache version으로 로드되는지도 확인한다.
