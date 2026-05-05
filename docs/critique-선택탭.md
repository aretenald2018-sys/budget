# 선택 탭 UX/UI 크리틱 및 개선 계획

## 1. 현재 문제 진단 (Top-Level)

| # | 문제 | 심각도 | 위치 |
|---|------|--------|------|
| 1 | 모달 시스템 3중 분열 | 🔴 Critical | style.css 487, 13988, 14222 |
| 2 | 카드 디자인 5종 난립 | 🔴 Critical | render-cart.js 전체 |
| 3 | 히어로 그라디언트 앱 전체와 불일치 | 🟡 Major | style.css 4374 |
| 4 | 액션 버튼 계층 붕괴 | 🟡 Major | 13520–13568 |
| 5 | 세그먼트 전환 UI 불통일 | 🟡 Major | cart-status-tabs / cart-filter-rail |
| 6 | 빈 상태(empty state) 비일관 | 🟠 Medium | 여기저기 |
| 7 | 정보 밀도 과다 (Bank 세그먼트) | 🟠 Medium | choiceBankFeed() |
| 8 | 죽은 코드 잔존 | 🟠 Medium | buySegmentHtml, doSegmentHtml, bankSegmentHtml |

---

## 2. 상세 크리틱

### 2-1. 모달 시스템 3중 분열

현재 3종의 서로 다른 모달/시트 패턴이 혼재:

| 모달 | z-index | 열기 방식 | 닫기 방식 | 애니메이션 |
|------|---------|-----------|-----------|-----------|
| `choice-capture-layer` | 180 | `.hidden` 토글 | backdrop click + × btn | **없음** |
| `tds-modal-overlay` | 600 | `.open` 클래스 | overlay click + × btn | `tds-slide-up 0.3s` |
| `choice-visual-picker-layer` | (없음) | DOM rerender | backdrop click | **없음** |

**문제점:**
- 캡처 시트가 열린 상태에서 디테일 모달이 뒤에 가려짐 (z-index 충돌)
- 캡처 시트만 애니메이션 없음 → 느닷없이 나타남
- 비주얼 피커는 STATE 변경 + 전체 rerender → 성능 낭비 + 스크롤 위치 리셋
- 닫기 패턴이 모두 다름: 사용자가 학습할 수 없음

**개선:**
→ **단일 모달 시스템** (`tds-modal-overlay`) 기반으로 통합
- 모든 시트에 동일한 `slide-up` + `backdrop-blur` 적용
- z-index 통일: 600 (모달) / 700 (모달 위 모달, 피커)
- 닫기: 항상 backdrop + handle swipe + × 버튼 3종 제공

---

### 2-2. 카드 디자인 5종 난립

| 카드 종류 | border-radius | 패딩 | 이미지 | 액션 패턴 |
|-----------|---------------|------|--------|-----------|
| `choice-product-card` | 16px | 0 (body: 11px) | 1:1.18 aspect | pill 버튼 행 |
| `cart-simple-card` | 18px | 내부 가변 | 없음/소형 | grid 3열 버튼 |
| `cart-recipe-card` | 18px | 11px | 96px 정사각 | grid 3열 버튼 |
| `pact-card` | (CSS 미확인) | 가변 | 아이콘 only | 자체 패턴 |
| `selection-choice-card` | (CSS 미확인) | 가변 | 없음 | 없음 |

**문제점:**
- 같은 화면에 5가지 다른 카드 스타일이 혼재 → 시각적 노이즈
- border-radius조차 16px / 18px 혼용
- 이미지 처리: 1:1.18 / 1:1(96px) / 아이콘 / 없음 → 리듬 붕괴
- 타이포: 14px/790 vs 13px/750 등 미세하게 다른 값 남발

**개선:**
→ **카드 2종으로 통합:**
1. **피처드 카드** (이미지 상단, 16:9 비율, 아래에 메타): 상품/레시피 공용
2. **컴팩트 카드** (좌: 56px 썸네일, 우: 텍스트): 퀘스트/뱅크 엔트리 공용
- border-radius: 모두 `18px` (디자인시스템 기준)
- 액션: 모두 `좌: ghost 버튼들 / 우: primary 1개` 패턴

---

### 2-3. 히어로 그라디언트 불일치

| 영역 | 현재 그라디언트 |
|------|----------------|
| 홈 탭 히어로 | `#1a2244 → #2a2f5a → #3a2d6e` (차가운 인디고-퍼플) |
| 선택 탭 히어로 | `#7c3aed → #db2777` (보라→핑크, 완전히 다른 팔레트) |
| 목표 탭 히어로 | 홈과 동일 |
| 검토 탭 | 히어로 없음 |

**문제점:**
- 선택 탭만 유독 다른 색감 → 같은 앱인지 의심스러움
- 보라→핑크는 화려하지만, 다른 탭의 차분한 인디고와 톤 충돌
- 프로그레스 바(`--grad-bar: #7a8cff → #b388ff`)와도 불일치

**개선:**
→ 히어로 그라디언트를 앱 전체 통일 (`#1a2244 → #2a2f5a → #3a2d6e`)
→ 선택 탭 고유색은 **세그먼트 컨트롤의 active pill**에만 적용: `#7c3aed`
→ 카드 좌측 3px border-accent 에만 퍼플 사용 (디자인시스템 pact card 규칙)

---

### 2-4. 액션 버튼 계층 붕괴

현재 5종류의 버튼 패턴:

| 위치 | Primary | Secondary | Ghost |
|------|---------|-----------|-------|
| choice-product-card | accent-tint bg + accent text | surface2 bg | — |
| cart-simple-card | `.tds-btn.sm` | `.tds-btn.sm` | — |
| cart-recipe-card | 동일 | 동일 | — |
| pact-card | 자체 정의 | 자체 정의 | — |
| 모달/시트 | `.tds-btn` | `.tds-btn.secondary` | `.tds-btn.ghost` |

**개선:**
→ 앱 전역 버튼 계층 3단계로 통일:
1. **Primary**: `background: var(--accent); color: #fff; border-radius: 12px`
2. **Secondary**: `border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary)`
3. **Ghost/Text**: `border: 0; background: transparent; color: var(--accent)`

---

### 2-5. 세그먼트 전환 UI 불통일

| 위치 | 컴포넌트 | 스타일 |
|------|----------|--------|
| 히어로 내부 | `cart-status-tabs` | 탭바 (밑줄 active) |
| 콘텐츠 영역 | `cart-filter-rail` | pill 스크롤 (배경 active) |
| Mockup-r | `segmented` | iOS style (bg swap) |

**개선:**
→ iOS-style segmented control 1종으로 통일
- 위치: 히어로 바로 아래, 고정
- 스타일: `background: var(--surface2); border-radius: 12px; padding: 3px`
- Active: `background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08)`

---

### 2-6. 비주얼 피커 → 캡처 시트 기능 중복

| 기능 | choice-capture-sheet | choice-visual-picker | choice-detail-visual-editor |
|------|---------------------|---------------------|---------------------------|
| 이미지 검색 | ✓ | ✓ | ✓ |
| URL 입력 | ✓ | ✓ | ✓ |
| 스톡 후보 | ✗ | ✓ | ✓ |
| 제목 입력 | ✓ | ✗ | ✗ (별도 form) |
| 가격 입력 | ✓ | ✗ | ✗ (별도 form) |
| 조건 설정 | ✗ | ✗ | ✓ |

**문제:** 같은 이미지 관리 UI가 3곳에 분산, 각각 미묘하게 다른 기능.

**개선:**
→ **이미지 편집 = 단일 바텀시트** (어디서든 같은 UI 호출)
→ 캡처 시트: URL 입력 → 자동 파싱 (이미지/제목/가격) → 조건 설정 → 저장
→ 디테일 모달에서 이미지 영역 탭 → 같은 이미지 편집 시트 호출

---

## 3. 개선 계획

### Phase 1: 모달 통합 (코드)
- [ ] `choice-capture-layer` → `tds-modal-overlay` 기반으로 변경
- [ ] `choice-visual-picker-layer` → tds-modal (nested, z-index: 700)
- [ ] `choice-detail-sheet` → 이미 tds-modal 사용중, z-index 확인만
- [ ] 공통 open/close 함수 1개로 통합: `openChoiceSheet(type)`
- [ ] 모든 시트에 `tds-slide-up` 애니메이션 적용

### Phase 2: 카드 통합 (CSS + JS)
- [ ] `choice-product-card` 기반으로 모든 카드 통일 (이미지 카드)
- [ ] `cart-simple-card`, `cart-recipe-card` → 이미지 카드로 전환
- [ ] `pact-card` → 컴팩트 카드 (56px 아이콘 좌측) 형태 통일
- [ ] `selection-choice-card` → 컴팩트 카드로 통일
- [ ] 공통 radius: 18px, padding: 14px, border: `1px solid var(--border)`

### Phase 3: 히어로 + 세그먼트 (CSS)
- [ ] `.cart-decision-hero` 그라디언트 → 홈과 동일 (`#1a2244 → #3a2d6e`)
- [ ] 세그먼트 컨트롤: iOS-style 1종으로 교체
- [ ] 히어로 내 3-stat grid 유지 (tabular-nums)

### Phase 4: 버튼 + 폼 통일 (CSS)
- [ ] 모든 카드 내 버튼 → `.tds-btn` / `.tds-btn.secondary` / `.tds-btn.ghost`
- [ ] 카드 내 버튼 크기: `min-height: 32px; font-size: 12px; border-radius: 10px`
- [ ] 모든 input → `.tds-input` (이미 존재)

### Phase 5: 죽은 코드 제거
- [ ] `buySegmentHtml()`, `doSegmentHtml()`, `bankSegmentHtml()` 삭제
- [ ] 관련 CSS 정리

---

## 4. 디자인 토큰 (통일 기준)

```css
/* 선택 탭 — 앱 전역 토큰 그대로 사용 */
--bg: #f5f6fa;
--surface: #ffffff;
--surface2: #f2f4f8;
--border: #e4e8f0;
--text: #191f28;
--text-2: #4e5968;
--text-3: #8b95a1;
--accent: #6366f1;
--accent-tint: rgba(99,102,241,.08);
--grad-bar: linear-gradient(90deg, #7a8cff, #b388ff);

/* 히어로 (앱 통일) */
--hero-bg: linear-gradient(135deg, #1a2244 0%, #2a2f5a 55%, #3a2d6e 100%);
--hero-shadow: 0 16px 40px rgba(58,45,110,.35), 0 4px 12px rgba(26,34,68,.2);

/* 선택 탭 고유 accent (세그먼트 active 전용) */
--choice-accent: #7c3aed;
--choice-accent-tint: rgba(124,58,237,.10);
```

---

## 5. 통일 카드 스펙

### 피처드 카드 (Featured Card)
```
┌────────────────────────────────────┐
│  [이미지 16:9 aspect-ratio]        │
│  ┌badge┐              ┌price pill┐ │
│  └─────┘              └──────────┘ │
├────────────────────────────────────┤
│  Title (14px/780)                  │
│  Meta (11px/620, text-3)           │
│  ┌──progress bar──────────────┐    │
│  └────────────────────────────┘    │
│  [Ghost btn] [Ghost btn] [Primary] │
└────────────────────────────────────┘
radius: 18px
border: 1px solid var(--border)
shadow: var(--shadow-sm)
```

### 컴팩트 카드 (Compact Card)
```
┌────────────────────────────────────┐
│ ┌──56px──┐  Title (14px/780)       │
│ │ image  │  Meta (11px, text-3)    │
│ │ /icon  │  ┌progress bar──────┐   │
│ └────────┘  └──────────────────┘   │
│             [Ghost] [Primary]      │
└────────────────────────────────────┘
radius: 18px
border: 1px solid var(--border)
padding: 14px
```

---

## 6. 통일 모달 스펙

```
┌─────────────────────────────────────┐
│  ═══ (handle, 36×4px, center)       │
│                                     │
│  Title (18px/840)     [× close btn] │
│  subtitle (12px, text-3)            │
│                                     │
│  ─── content area (scroll) ───      │
│  ...                                │
│  ...                                │
│  [Full-width primary button, 48px]  │
└─────────────────────────────────────┘
border-radius: 24px 24px 0 0
max-height: 90vh (88dvh)
animation: tds-slide-up 0.3s cubic-bezier(0.32,0.72,0,1)
backdrop: rgba(0,0,0,.6) + blur(4px)
z-index: 600 (base) / 700 (nested)
```

---

## 7. 검증

- [ ] 모든 모달이 동일한 열기/닫기 동작
- [ ] 카드가 같은 화면에서 2종 이하만 사용
- [ ] 히어로 그라디언트가 다른 탭과 동일
- [ ] 세그먼트 전환 시 레이아웃 깜빡임 없음
- [ ] 버튼 계층이 3단계 내로 식별 가능
