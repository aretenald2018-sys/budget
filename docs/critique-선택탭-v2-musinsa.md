# 선택 탭 v2 — 무신사 머지 크리틱 & 개선 계획

> **이전 문서**: `docs/critique-선택탭.md` (Phase 1, 모달 3중 분열·카드 5종 난립 진단)
> **이 문서**: 코덱스가 그 이후 새로 구현한 `choice-feed-shell` 패턴(이미지 캐러셀 히어로 + product card grid + bank dashboard)을 **디자인 최고 책임자 시점**으로 다시 비평하고, 무신사 스타일 머지 결정에 따라 **구현 가능한 단일 사양**으로 축약한다.
>
> **사용자 합의**: ① 히어로는 무신사식 이미지 캐러셀 유지·강화 ② 카드는 edge-to-edge 1:1 정사각 이미지 ③ 무신사식은 want+do 세그먼트만, bank는 라이트 대시보드 유지

---

## 1. 현재 상태 (코드 직접 검수 결과)

### 1-1. 렌더 파이프라인

```
renderCart()
 └─ cartBoard()
     ├─ choice-feed-search        (URL 붙여넣기 entry, bank에서는 숨김)
     ├─ choice-feed-tabs          (밑줄형 추천/보류함/감각뱅크 + "이미지 파싱" 버튼)
     ├─ choice-visual-carousel    (자동회전 1:1.18 이미지 슬라이드 hero)  ← bank 제외
     ├─ choice-promo-rail         (94px 썸네일 가로 스크롤)               ← bank 제외
     ├─ {want|do|bank} 분기 피드
     ├─ choice-feed-fab           (+ 버튼, 모바일 우하단 고정)
     └─ choice-visual-picker-sheet(STATE.visualPicker* 활성 시)
```

**확인**: 이전 비평에서 지적한 `cart-decision-hero` (보라→핑크 그라디언트 사각 카드) — **CSS는 4374·7490·8080·10166라인에 잔존하지만 render-cart.js에서 더이상 호출되지 않음**. 죽은 코드.

### 1-2. 모달 3종 직접 검수

| # | 모달 | 위치 (style.css) | z-index | 열기 | 애니메이션 | 닫기 | 핸들 | × 버튼 | 헤더 패턴 |
|---|------|-----------------|---------|------|----------|------|------|--------|---------|
| A | `choice-capture-layer` | 13988 | **180** | `.hidden` 토글 | **❌ 없음** | backdrop / data-cart-capture-close | ✓ (border) | ✓ (border 1px circle) | `choice-sheet-head` |
| B | `choice-visual-picker-layer` | 14222 | **190** | DOM rerender(STATE.visualPickerItemId) | **❌ 없음** | backdrop / data-cart-action="close-visual-picker" | ✓ (border) | ✓ + "상세 수정" 보조 버튼 | `choice-sheet-head` + `choice-sheet-head-actions` |
| C | `choice-detail-modal` (`tds-modal-overlay`) | 487 | **600** | `window.openModal(...)` | ✅ `tds-slide-up 0.3s` | overlay click + closeModal | ✓ (`tds-modal-handle`) | **❌ 닫기 버튼 없음** (oversight) | `tds-modal-title` ("선택 상세" 텍스트만) |

**모달 검수 발견**:
- A·B는 같은 `choice-sheet-*` 클래스를 공유하지만 **별도 layer DOM**. 같은 화면에 동시 노출 불가능 (B 열면 A는 보이지 않지만 z-index 충돌은 명목적).
- C는 닫기 버튼이 **아예 없음**. iOS 사용자는 "위에서 swipe" 패턴을 모르면 backdrop 탭으로만 빠져나갈 수 있음.
- A는 폼 submit 후 `closeCaptureSheet()`가 실행되지만 **저장 성공 토스트 없음** (line 156–162). 사용자에게 피드백 부재.
- B는 `STATE.visualPickerItemId` 변경마다 `loadCartItems()` → 전체 board rerender. **picker 안에서 검색만 해도 뒤의 그리드가 다시 그려지면서 스크롤이 0으로 점프**. 성능·UX 양쪽 손실.
- 세 모달 모두 backdrop blur·dim 강도가 다름 (`rgba(15,23,42,.32)` × 2 vs `rgba(0,0,0,.6)` + 4px blur).

### 1-3. 카드/그리드 직접 검수

`choice-product-card`(render-cart.js 547):
- `aspect-ratio: 1 / 1.18` — 무신사보다 살짝 세로형
- 이미지 좌상단 `choice-product-badge`, 우하단 `choice-product-price` pill
- 우상단 `choice-image-edit-btn`("바꾸기"/"추천")
- 본체: 제목(2줄, 14px/790) + 메타(11px/620) + `choice-gauge` + 액션 행(secondary chip + primary action)
- `border: 1px solid var(--border)`, `border-radius: 16px`, `box-shadow: shadow-sm`

**문제 6가지**:
1. **이미지 위 정보 4종 동시**: badge·price·edit btn·needs-image 가상요소 — 시각 경합
2. **secondary action 공간 부족**: 카드 폭 165px에 [상세][원문][조건][실행함] 4개를 욱여 넣음 → ellipsis로 잘리거나 줄 바뀜
3. **gauge가 항상 노출**: 진행 100%인 ready 카드도 게이지 표시 → 정보 의미 없음
4. **needs-image 가상요소**: 이미지 없을 때 "이미지 추천 받기" pill이 본문 위 40px에 떠 있음 (z:2). 본문 강조보다 강함
5. **카드 좌우 간격(gap:10px)이 좁아 두 카드가 한 덩어리처럼 보임**: 브랜드 구분 약함
6. **레시피·구매·퀘스트가 같은 카드 컴포넌트**인데 메타 행이 모두 다른 의미를 같은 자리에 표시 → 정보 위계 혼란

### 1-4. UX 구멍 (이전 비평에 안 잡힌 새 발견)

| # | 발견 | 심각도 | 위치 |
|---|------|--------|------|
| 1 | `breakPact()`가 native `prompt()` 호출 — 디자인시스템 외부, 모바일 키보드 점프 | 🔴 Critical | render-cart.js:2640 |
| 2 | "안 살래요/넘김" 전용 시트 부재. urge 적립 진입로가 pact_fulfilled/pact_broken 흐름에만 존재 → 카트 아이템 보고 충동을 참은 행위가 기록되지 않음 | 🔴 Critical | renderer 전반 |
| 3 | `choice-product-primary-action`이 "실행함/되돌림"인데 pact는 "실현/되돌림" — 같은 자리, 다른 동사 → 학습 비용 | 🟡 Major | 564–567 |
| 4 | 캡처 시트 `<details>` "선택 정보 조정"이 기본 닫혀 있어 카테고리/제목 수정이 숨겨짐. URL만 붙여넣고 저장하면 placeholder 데이터로 저장될 위험 | 🟡 Major | 114 |
| 5 | promo-rail(94px 썸네일) 클릭 시 `data-cart-action="open-capture"` — **상세가 아니라 캡처 시트가 열림**. 사용자는 "이걸 다시 만들고 싶다"가 아니라 "이게 뭐였더라"를 보고 싶을 때가 더 많음 | 🟡 Major | 298 |
| 6 | bank 세그먼트의 success-line "0건의 선택 · 0% 성공률" — 데이터 없을 때도 noisily 노출 | 🟠 Medium | 388 |
| 7 | choice-feed-fab이 `position: fixed` + `right: calc(50% - min(215px, 50vw) + 18px)` — 좁은 화면에서 영수증/상세 시트 위로 스크롤되며 겹침 | 🟠 Medium | 13973 |
| 8 | "이미지 파싱" 버튼이 세그먼트 탭 옆에 끼여 있음 — 탭처럼 보이지만 액션 버튼. role 혼동 | 🟠 Medium | 203 |
| 9 | `prompt()` 외에도 `confirm()` 사용 흔적은 없으나 toast → reload 흐름이 모달 닫힘 직전 깜빡임 발생 | 🟠 Medium | bindChoiceDetail 1540 |

### 1-5. 통일성 부재 통계

| 영역 | 다른 패턴 개수 | 위치 샘플 |
|------|-------------|---------|
| 모달 컨테이너 | 3종 | choice-capture-layer / choice-visual-picker-layer / tds-modal-overlay |
| 닫기 버튼 형태 | 3종 | × icon button / × icon button + secondary action / 닫기 버튼 없음 |
| 이미지 편집 진입로 | 3개소 동일 UI 중복 | visual-picker / detail 모달 내 details / detail 모달 thumb-action |
| 카드 액션 행 | 3종 | secondary chip + primary pill (product) / 3-grid btn (recipe-card) / icon-only (bank-entry) |
| 세그먼트/탭 표현 | 4종 | feed-tabs(밑줄) / bank-range(pill) / pact filter chip / wizard step-bar |
| 진행 게이지 | 2종 | choice-gauge(5px) / pact-progress(별도) |
| 빈 상태 | 3종 | choice-empty-visual(118px image+CTA) / empty-state.compact / placeholder text |
| 강조 색상(보라계) | 4종 | `#6366f1`(accent) / `#7a8cff→#b388ff`(grad-bar) / `#7c3aed→#db2777`(legacy hero) / `#a855f7`(pact accent) |

---

## 2. 디자인 책임자 관점 종합 비평

### 2-1. "정체성"이 없다

선택 탭은 **"내가 충동에 진 게 아니라 미루기로 결정한 것들의 비주얼 보드"**가 핵심 가치다. 그런데 현 화면은:
- 히어로(이미지 캐러셀)는 **무신사식**
- 카드 그리드는 **토스식**(둥근 모서리 + 그림자 + 패딩)
- 본문 액션 행은 **카카오톡 채널식**(pill 가로 나열)
- 모달은 **iOS bottom sheet 흉내**
- 빈 상태와 "이미지 추천 받기"는 **오피스 365의 placeholder**

→ 한 화면 안에 5가지 미적 출처가 동시 노출. 사용자는 "이 화면이 뭘 보여주려 하는가"를 학습할 수 없다.

**해결 방향**: 히어로의 무신사 DNA를 카드까지 일관되게 흘려야 함. 즉 **카드도 무신사 그리드 문법**(edge-to-edge image, 카테고리·제목·가격 위계, 액션은 카드 외부 floating)으로 리스트업.

### 2-2. "다음 행동"이 안 보인다

무신사 홈을 열었을 때 사용자가 즉각 알 수 있는 다음 행동은 ① 카드 탭→상세 ② 좋아요 ③ 카트 담기 — 단 3가지. 선택 탭은:
- 카드당 보이는 액션 = [상세] [원문] [조건] [실행함] = 4개
- 그 위에 [이미지 바꾸기] = 5개
- 그 위에 badge·price = 7개 시각 경합

→ Hick's Law 위반. 카드당 노출 액션을 **2개 이하**(primary 1 + 더보기 1)로 정리해야 함.

### 2-3. "기록"이 사라지는 흐름

choice 시스템의 본질은 **충동을 참은 사실이 감각뱅크에 적립되는 것**. 그런데:
- 카트 아이템에 [실행함] 버튼만 있고 [참았음] 버튼이 없다
- "참았음" 시트가 없다
- pact 깨짐 회고는 native `prompt()`로 버려진다

→ 행동경제학 가치 자체가 새고 있다. **want 카드의 primary action은 "실행함"이 아니라 "참았음"이 더 정체성에 부합**할 수도 있다 (이건 PM 결정이지만 기록되어야 함).

### 2-4. "감각뱅크"는 다른 앱처럼 보인다

`choice-bank-dashboard`는 hero, range pill, metrics, collections, pact-card, pattern-card, recent — **7개 섹션**이 위아래로 쌓임. 라이트 대시보드인 건 좋지만:
- hero·pact-card·pattern-card·recent가 모두 같은 크기·반경·그림자의 흰 카드 → 위계 부재
- "성공률 0%"가 데이터 없을 때도 표시되어 부정 정서 유발
- 7섹션이 모두 한 스크롤에 노출 → 핵심(절약 합계·이번 주 패턴)이 평균에 묻힘

→ **3섹션으로 압축**: ① 절약 hero ② 이번 주 패턴 ③ 최근 좋은 선택 리스트. 나머지(collections·pact-card·metrics)는 hero의 보조 KPI 라인으로 흡수.

---

## 3. 무신사 머지 적용 결정 (확정)

| 영역 | 결정 |
|------|------|
| 히어로 | **무신사 캐러셀 유지·강화** — 1:1.18 비율, 자동 회전, white copy 오버레이, dot indicator |
| 카드(want·do) | **edge-to-edge 1:1 정사각 이미지** — border 제거, radius 12px, 카테고리·제목·가격 위계 |
| 카드(bank) | **라이트 대시보드 유지** — design-system.md 토큰 그대로, 카드 한 장에 hero + KPI 응집 |
| 모달 | **`tds-modal-overlay` 단일 시스템** — A/B 모달을 같은 구조로 흡수 |
| 세그먼트 | **밑줄형 유지** — 무신사 메인 카테고리 탭과 동일한 시각 패턴 |
| 강조색 | **`--accent` (`#6366f1`) + `--grad-bar` (히어로 progress)로 통일** — `#7c3aed→#db2777` legacy 그라디언트 폐기 |
| 액션 위계 | **카드당 primary 1개 + overflow(`⋯`) 1개** — 나머지는 상세 모달로 |

---

## 4. 통일 사양

### 4-1. 카드 (Musinsa Choice Card)

```
폭: 175px (390px 컨테이너에서 2열, gap 12px, 좌우 padding 18px)

┌─────────────────────────┐
│                         │
│    [IMG 1:1 cover]      │ ← border-radius 12px (top), 이미지가 카드 본체
│                         │
│  [⋯]              [pill]│ ← 좌하단 더보기, 우하단 가격/배지 pill (반투명 배경)
└─────────────────────────┘
  카테고리·도메인 (10px/600 text-3, uppercase 살짝)
  상품 제목 두 줄까지 잘림 (13px/780 text)
  ₩45,000 (15px/900 text, tabular-nums)
```

**규칙**:
- card border 제거, shadow 제거 (이미지 자체가 시각적 단위)
- 좌하단 `⋯` 버튼만 floating — 탭 시 액션시트(상세/원문/조건/실행/참음/삭제) 호출
- 진행 중인 조건이 있으면 본체 하단에 **2px 두께 progress 라인** 한 줄로만 표시 (text-3 색상)
- ready(조건 100% 도달)인 경우 좌상단에 **"열림" 점멸 dot** + 우상단 "→ 실행" pill 추가 (예외)

### 4-2. 히어로 (Musinsa Visual Carousel)

design-system.md의 다크 hero card는 **홈/목표 탭 전용**. 선택 탭은 다음 예외 인정:

```
높이: aspect-ratio 1 / 1.18 (현재와 동일)
배경: 사용자 이미지 또는 generated visual
오버레이: linear-gradient(180deg, transparent 32%, rgba(15,23,42,.72) 100%)
copy 위치: 좌하단 (radius 18px 안쪽 16px 여백)
copy 위계:
  - badge pill (11px/780, white .86 alpha bg)
  - h2 23px/880 -0.03em white
  - 서브 카피 12px/620 white .78 alpha
indicator: 하단 3-dot, 12s 자동회전
swipe: touch swipe로 수동 전환 가능 (현재 미구현 → 추가)
```

**복구가 필요한 점**: 캐러셀이 자동회전만 하고 swipe·탭이 안 됨. 추가 구현 필요.

### 4-3. 모달 (Unified Sheet System)

**결정**: `tds-modal-overlay`로 통합하되, 캡처/이미지 편집/상세 3개의 `subtype`을 정의.

```css
.tds-modal-overlay { z-index: 600; }              /* base */
.tds-modal-overlay.nested { z-index: 700; }        /* 모달 위 모달 — 이미지 편집을 상세 위에서 호출할 때 */
.tds-modal-sheet {
  border-radius: 24px 24px 0 0;
  max-height: 90vh;
  animation: tds-slide-up 0.3s cubic-bezier(0.32,0.72,0,1);
}
.tds-modal-handle { 36×4px, --border-light, margin: 12px auto 16px; }
```

**공통 헤더**:
```
┌───────────────────────────────────┐
│  ═══ (handle, center)             │
│                                   │
│  [icon 32×32]  Title  (18/840)  ×│  ← right side: × close, 36×36
│                Subtitle (12/text-3)│
└───────────────────────────────────┘
```

**Subtype별 차이**:
| Subtype | 진입로 | 본문 | 하단 CTA |
|---------|--------|------|---------|
| capture | + FAB / 검색 박스 / 공유 인텐트 | parse card + URL input + condition row + "정보 조정" details | "선택 피드에 담기" full-width primary |
| image-picker | 카드 좌하단 ⋯ → "이미지 바꾸기" / 상세 모달 안에서 호출 | preview 142px + 검색 form + URL form + stock grid | (없음 — 후보 탭하면 즉시 적용) |
| detail | 카드 탭 / promo-rail 탭 | poster(220px) + receipt form + condition editor | "저장" primary + "참았음/실행함" secondary + "삭제" ghost-danger |

**닫기 패턴 통일**:
- backdrop click ✓
- handle swipe-down ✓ (touch handler 추가)
- × button ✓ (모든 모달에 빠짐없이)

### 4-4. 액션 위계

전역 3단계로 통일:

```css
.tds-btn          { background: var(--accent); color: #fff; height: 44px; border-radius: 12px; font-weight: 800; }
.tds-btn.full     { width: 100%; }
.tds-btn.sm       { height: 32px; padding: 0 12px; font-size: 12px; border-radius: 10px; }

.tds-btn.secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.tds-btn.ghost    { background: transparent; color: var(--accent); border: 0; }
.tds-btn.danger-text { background: transparent; color: var(--negative); border: 0; }
```

**카드 안 액션은 모두 사라지고**, 카드 외부 액션시트로 흡수. `choice-product-secondary-actions`·`choice-product-primary-action` 클래스 제거.

### 4-5. 새 컴포넌트: 충동 회고 시트

**목적**: 카드 ⋯ → "참았음" 클릭 시 호출. 또는 pact 깨질 때.

```
┌───────────────────────────────────┐
│  ═══                              │
│                                   │
│  💜 충동 기록                  ×  │
│  무엇을 미루었는지 한 줄만 남겨도 됩니다.│
│                                   │
│  [의도] ○ 참았음 ● 미뤘음 ○ 대체  │ ← segmented
│                                   │
│  무엇을         러닝화        │
│  절약 금액      89,000원      │ ← 카트 아이템에서 prefill
│  절약 kcal      (선택)        │
│  메모          (선택, 1줄)    │
│                                   │
│  [감각뱅크에 적립]               │ ← full-width primary
└───────────────────────────────────┘
```

→ 이걸로 `prompt()`와 "기록 누락" 두 문제 동시 해결.

### 4-6. 감각뱅크 압축 (3섹션)

```
┌─────────────────────────────────────┐
│ 감각뱅크 hero (한 카드)             │
│  "올해 참은 가치"  ₩324,500          │
│  -1,820kcal · 27건 좋은 선택 · 65% │
│  [biweek][30d][all] range pill     │
│  [progress bar to next milestone]   │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 이번 주 패턴 (한 카드)              │
│  bar chart + insight 한 줄         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 최근 좋은 선택 (한 카드)            │
│  3-5개 entry list (없으면 empty)    │
└─────────────────────────────────────┘
```

기존 `choice-bank-collections`·`choice-bank-pact-card`·`choice-bank-metrics` 7섹션 → 3섹션. 기능은 hero의 KPI 라인으로 흡수 (3 dot 지표).

---

## 5. 구현 마이그레이션 (Phase)

### Phase 1: 죽은 코드 제거 (선결)
- [ ] `cart-decision-hero` CSS 블록 4개 (line 4367–4387, 7490, 7700, 8080) 삭제
- [ ] `buySegmentHtml/doSegmentHtml/bankSegmentHtml` 함수 + 호출부 삭제 (현재 미사용)
- [ ] `cart-source-sheet` div (renderCart line 61) — 사용처 grep 후 삭제
- [ ] 보라→핑크 그라디언트 5곳 (style.css 4670, 4923, 5059, 5087, 5168, 5453) → `var(--grad-bar)` 또는 `var(--accent)`로 교체

### Phase 2: 모달 통합
- [ ] `choice-capture-layer` → `tds-modal-overlay` 기반으로 리팩터링. `<section>` → `<div class="tds-modal-overlay">`. 클래스 명만 매핑하지 말고 z-index·애니메이션·핸들 모두 tds 토큰으로.
- [ ] `choice-visual-picker-layer` → 같은 방식. 단 `.nested` 클래스 부여 (상세 모달 위에서 호출 가능하도록).
- [ ] `choice-detail-modal`에 × 닫기 버튼 추가 (`tds-modal-close`).
- [ ] `bindChoiceVisualPicker` 호출 시 `loadCartItems()` 전체 rerender 제거 → picker 내부 부분 rerender만.

### Phase 3: 카드 무신사화
- [ ] `choice-product-card` → `choice-musinsa-card`로 클래스 교체 (나란히 두고 STATE.layout으로 토글 가능하게).
- [ ] aspect-ratio: `1 / 1.18` → `1 / 1`.
- [ ] border·shadow 제거. radius 12px로 통일.
- [ ] 본체 액션 행 → 카드 좌하단 ⋯ 버튼 + 액션시트로.
- [ ] needs-image pill 제거. 이미지 없으면 generated visual 그대로 보여주고 ⋯ 버튼 안에 "이미지 추천" 메뉴.
- [ ] gauge → ready 카드와 진행 중 카드만 1px 라인으로 표시. 나머지 숨김.

### Phase 4: 세그먼트별 흐름 정리
- [ ] want 세그먼트: 캐러셀 + promo-rail + musinsa grid
- [ ] do 세그먼트: musinsa grid + 진행 게이지 강화 (조건이 있는 카드는 카드 외부 progress 1px 띠)
- [ ] bank 세그먼트: 3섹션으로 압축 (위 4-6)
- [ ] pact composer는 bottom sheet로 분리 (현재 inline `<details>` → modal)

### Phase 5: UX 구멍 메우기
- [ ] 충동 회고 시트 신규 (urge-modal.js로 분리, modals/ 디렉토리에 추가)
- [ ] `breakPact()`의 `prompt()` → 충동 회고 시트 호출로 교체
- [ ] 카드 ⋯ → 액션시트("상세 / 원문 보기 / 조건 추가 / 참았음 / 실행함 / 삭제")
- [ ] promo-rail 탭 → `data-cart-action="open-detail"`로 변경 (open-capture 대신)
- [ ] success-line 0건일 때 "첫 좋은 선택을 기다리는 중" empty copy로 교체
- [ ] choice-feed-fab → 무신사 검색 박스를 sticky 헤더로 승격하고 FAB는 제거 (capture 진입로 단일화)

### Phase 6: 검증
- [ ] 모달 3개 모두 backdrop·×·swipe로 닫힘
- [ ] 한 화면에 카드 종류 1개 (musinsa-card)만 사용 (bank 제외)
- [ ] 카드당 노출 액션 ≤ 2개
- [ ] `prompt()`/`confirm()` grep 결과 0건
- [ ] 충동 회고 흐름이 카트 → urge 적립 → bank 노출까지 1pass에 동작
- [ ] 보라→핑크 그라디언트 grep 결과 0건 (legacy 폐기)

---

## 6. 디자인 토큰 (선택 탭 적용분)

```css
:root {
  /* 기본은 design-system.md 그대로 */
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

  /* 무신사 머지 추가 */
  --musinsa-card-radius: 12px;
  --musinsa-card-overlay: linear-gradient(180deg, transparent 50%, rgba(15,23,42,.72) 100%);
  --musinsa-meta-color: #8b95a1;
  --musinsa-price-weight: 900;
  --musinsa-grid-gap: 12px;
}

/* legacy 제거 — 같이 grep */
/* --hero-grad-pink, .cart-decision-hero, .choice-product-card border 등 폐기 */
```

---

## 7. 결과로 얻는 것

| Before | After |
|--------|-------|
| 한 화면 카드 종류 5개 | 2개 (musinsa-card · bank-section) |
| 모달 패턴 3종 | 1종 (`tds-modal-overlay` + subtype 3) |
| 카드당 액션 4–7개 | 2개 (primary CTA + ⋯) |
| 보라계 컬러 4종 | 2종 (`--accent` · `--grad-bar`) |
| 충동 회고 진입로 | native prompt → 전용 시트 |
| 감각뱅크 섹션 7개 | 3개 |
| `cart-decision-hero` 죽은 CSS | 제거 |

→ **선택 탭의 정체성**: "이미지로 모은 충동을 천천히 결정하는 비주얼 보드". 무신사식 그리드 + 감각뱅크식 일기. 한 문장으로 설명되는 화면.
