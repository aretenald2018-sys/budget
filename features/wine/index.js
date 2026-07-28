import {
  deleteWineBottle,
  deleteWineTasting,
  displayCategoryName,
  isBudgetExcluded,
  listTransactions,
  listRewardPointEntries,
  listWineBottles,
  listWineTastings,
  getAppSettings,
  getCategories,
  saveWineBottle,
  saveWineTasting,
} from '../../data.js';
import {
  bottleDraftFromTx,
  buildWineCellarSummary,
  unlinkedWinePurchases,
} from '../../domain/wine/purchases.js';
import { buildRewardSavingsSummary, rewardTxWindowStart } from '../../utils/reward-savings.js';
import { createRewardPointModalController } from '../report/reward-point-modal/controller.js';
import { legacyTastingNotes } from '../../domain/wine/records.js';
import { escHtml } from '../../utils/dom.js';
import { fmtKRW } from '../../utils/format.js';
import { showToast } from '../../utils/toast.js';

let cellarState = {
  bottles: [], tastings: [], editor: null, imageUrl: null, imageThumbnail: null,
  // 가계부 연동 상태: 와인 결제 후보 · 셀러 요약(지출/포인트) · 편집 초안
  purchases: [], summary: null, draft: null,
  rewardSummary: null, rewardPointEntries: [], rewardPointItems: [],
};

// 와인 탭에서도 홈과 같은 포인트 사용·이력 모달을 쓴다. 스냅샷만 셀러가 로드한
// 데이터로 갈아끼운다(홈을 한 번도 안 들렀어도 동작하도록).
const winePointModalController = createRewardPointModalController({
  getSnapshot: () => ({
    rewardPointEntries: cellarState.rewardPointEntries,
    rewardPointItems: cellarState.rewardPointItems,
    rewardSummary: cellarState.rewardSummary,
  }),
  refresh: async () => {
    await loadCellar();
    renderCellar();
  },
});

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateInputValue(value = new Date()) {
  const date = toDate(value) || new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function displayDate(value) {
  const date = toDate(value);
  if (!date) return '날짜 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function bottleById(id) {
  return cellarState.bottles.find(bottle => bottle.id === id) || null;
}

function scoreText(score) {
  const value = Number(score);
  return Number.isFinite(value) && value > 0 ? `★ ${value.toFixed(1)}` : '평점 선택';
}

async function loadCellar() {
  const [bottles, tastings] = await Promise.all([
    listWineBottles({ max: 100 }),
    listWineTastings({ max: 100 }),
  ]);
  cellarState = { ...cellarState, bottles, tastings };
  await loadCellarLedger();
  return cellarState;
}

// 셀러의 가계부 쪽 절반: 와인 결제 후보와 와인구매 포인트 요약.
// 실패해도 셀러 자체는 계속 쓸 수 있어야 하므로 조용히 비워 둔다.
async function loadCellarLedger() {
  try {
    const appSettings = await getAppSettings();
    const rewardSettings = appSettings.rewardSavings || {};
    const from = rewardTxWindowStart(new Date());
    const [txs, pointEntries] = await Promise.all([
      listTransactions({ from, to: new Date(), max: 3000 }).catch(() => []),
      listRewardPointEntries({ max: 300 }).catch(() => []),
    ]);
    const spendable = txs.filter(tx => !isBudgetExcluded(tx));
    const rewardSummary = buildRewardSavingsSummary({
      transactions: spendable,
      pointEntries,
      categoryNames: getCategories().filter(cat => cat.kind === 'expense').map(cat => cat.name),
      getCategoryName: displayCategoryName,
      now: new Date(),
      ...rewardSettings,
    });
    cellarState.rewardSummary = rewardSummary;
    cellarState.rewardPointEntries = pointEntries;
    cellarState.rewardPointItems = Array.isArray(rewardSettings.pointItems) ? rewardSettings.pointItems : [];
    cellarState.purchases = unlinkedWinePurchases(spendable, cellarState.bottles, displayCategoryName).slice(0, 8);
    cellarState.summary = buildWineCellarSummary({
      transactions: spendable,
      bottles: cellarState.bottles,
      tastings: cellarState.tastings,
      pointBuckets: rewardSummary.pointBuckets,
      getCategoryName: displayCategoryName,
    });
  } catch (error) {
    console.warn('[wine-cellar] ledger load failed', error);
    cellarState.purchases = [];
    cellarState.summary = null;
  }
}

function bottleTitle(bottle) {
  return [bottle?.name || '이름 없는 와인', bottle?.vintage || ''].filter(Boolean).join(' · ');
}

// 카드 한 줄 미리보기 — 1차/2차 노트가 먼저, 없으면 예전에 남긴 기록을 그대로 살린다.
function tastingPreview(tasting) {
  const current = [tasting.firstNote, tasting.secondNote].map(value => String(value || '').trim()).filter(Boolean);
  if (current.length) return current.join(' · ');
  const legacy = legacyTastingNotes(tasting);
  return legacy.length ? legacy[0].value : '';
}

function tastingCard(tasting) {
  const bottle = bottleById(tasting.bottleId) || {};
  const note = tastingPreview(tasting) || '기억해 둘 한 줄을 남겨보세요.';
  return `
    <article class="wine-tasting-card" data-tasting-id="${escHtml(tasting.id)}">
      <button class="wine-tasting-main" type="button" data-wine-action="edit-tasting" data-id="${escHtml(tasting.id)}">
        <span class="wine-thumb ${bottle.imageThumbnail || bottle.imageUrl ? 'has-image' : ''}">
          ${bottle.imageThumbnail || bottle.imageUrl ? `<img src="${escHtml(bottle.imageThumbnail || bottle.imageUrl)}" alt="">` : '<span>🍷</span>'}
        </span>
        <span class="wine-tasting-copy">
          <small>${escHtml(displayDate(tasting.tastedAt))}</small>
          <strong>${escHtml(bottleTitle(bottle))}</strong>
          <span>${escHtml(note)}</span>
        </span>
        <span class="wine-score-chip">${escHtml(scoreText(tasting.taewooScore))}</span>
      </button>
    </article>`;
}

// 가계부 연동 요약: 와인 지출과 와인구매 포인트를 한 줄로.
function wineLedgerHtml() {
  const summary = cellarState.summary;
  if (!summary) return '';
  const points = summary.points;
  return `
    <section class="wine-ledger-card">
      <div class="wine-ledger-metric">
        <span>와인 지출</span>
        <strong>${escHtml(fmtKRW(summary.spent))}</strong>
        <small>${summary.purchaseCount}건 · 셀러 연결 ${escHtml(fmtKRW(summary.linkedSpend))}</small>
      </div>
      <div class="wine-ledger-metric">
        <span>${escHtml(points.label)}</span>
        <strong class="${points.balance < 0 ? 'neg' : 'pos'}">${points.balance < 0 ? '−' : '+'}${Math.abs(points.balance).toLocaleString('ko-KR')}P</strong>
        <small>${points.target ? `기준 ${escHtml(fmtKRW(points.target))}` : '적립 +' + points.earned.toLocaleString('ko-KR') + 'P'}</small>
      </div>
      <button type="button" class="wine-ledger-more" data-wine-action="open-points">포인트 사용·이력 ›</button>
    </section>`;
}

// 아직 셀러에 등록되지 않은 와인 결제 — 한 번 누르면 그 결제로 와인을 등록한다.
function winePurchaseInboxHtml() {
  const rows = cellarState.purchases;
  if (!rows?.length) return '';
  return `
    <section class="wine-inbox">
      <div class="wine-section-heading">
        <div><small>결제 내역에서</small><h3>등록하지 않은 와인 결제</h3></div>
        <span>${rows.length}</span>
      </div>
      <div class="wine-inbox-list">
        ${rows.map(tx => `
          <button type="button" class="wine-inbox-row" data-wine-action="bottle-from-tx" data-id="${escHtml(tx.id)}">
            <span class="wine-inbox-main">
              <strong>${escHtml(tx.merchant || tx.counterparty || '이름 없는 결제')}</strong>
              <small>${escHtml(displayDate(tx.occurredAt))}</small>
            </span>
            <span class="wine-inbox-amount">${escHtml(fmtKRW(tx.amount))}</span>
            <span class="wine-inbox-cta">와인 등록</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

function bottleCard(bottle) {
  const count = cellarState.tastings.filter(tasting => tasting.bottleId === bottle.id).length;
  return `
    <button class="wine-bottle-card" type="button" data-wine-action="edit-bottle" data-id="${escHtml(bottle.id)}">
      <span class="wine-bottle-image">
        ${bottle.imageThumbnail || bottle.imageUrl ? `<img src="${escHtml(bottle.imageThumbnail || bottle.imageUrl)}" alt="">` : '<span>🍾</span>'}
      </span>
      <strong>${escHtml(bottleTitle(bottle))}</strong>
      <small>${escHtml([bottle.region, bottle.variety].filter(Boolean).join(' · ') || '지역·품종 선택')}</small>
      <em>테이스팅 ${count}회</em>
    </button>`;
}

function cellarHtml() {
  const latest = cellarState.tastings[0] || null;
  return `
    <section class="wine-cellar-screen" aria-label="와인 기록">
      <header class="wine-screen-header">
        <div><small>날짜로 남기는 취향</small><h2>와인 기록</h2></div>
        <button type="button" class="wine-icon-button wine-add-button" data-wine-action="add-tasting" aria-label="테이스팅 추가">＋</button>
      </header>
      <div class="wine-screen-body">
        <section class="wine-hero-card">
          <div>
            <span>최근 테이스팅</span>
            <strong>${latest ? escHtml(displayDate(latest.tastedAt)) : '첫 기록을 남겨보세요'}</strong>
            <p>${latest ? escHtml(bottleTitle(bottleById(latest.bottleId))) : '마신 날짜와 와인만 있으면 저장할 수 있어요.'}</p>
          </div>
          <button type="button" data-wine-action="add-tasting">테이스팅 기록</button>
        </section>

        ${wineLedgerHtml()}
        ${winePurchaseInboxHtml()}

        <div class="wine-section-heading"><div><small>마신 순서대로</small><h3>테이스팅 노트</h3></div><span>${cellarState.tastings.length}</span></div>
        <div class="wine-tasting-list">
          ${cellarState.tastings.length ? cellarState.tastings.map(tastingCard).join('') : `
            <button class="wine-empty-state" type="button" data-wine-action="add-tasting">
              <span>🍷</span><strong>아직 테이스팅 기록이 없어요</strong><small>날짜와 와인을 선택해 첫 기록을 만드세요.</small>
            </button>`}
        </div>

        <div class="wine-section-heading wine-bottle-heading"><div><small>선택해서 기록</small><h3>내 와인 셀러</h3></div><button type="button" data-wine-action="add-bottle">와인 추가</button></div>
        <div class="wine-bottle-grid">
          ${cellarState.bottles.length ? cellarState.bottles.map(bottleCard).join('') : `
            <button class="wine-empty-state" type="button" data-wine-action="add-bottle">
              <span>🍾</span><strong>먼저 와인을 추가하세요</strong><small>이름만 입력해도 저장됩니다.</small>
            </button>`}
        </div>
      </div>
      <div data-wine-editor-host></div>
    </section>`;
}

function cellarRoot() {
  return document.getElementById('tab-wine');
}

function renderCellar() {
  const root = cellarRoot();
  if (!root) return;
  root.innerHTML = cellarHtml();
  bindCellar(root.querySelector('.wine-cellar-screen'));
}

// 와인 탭 렌더러 (app.js TAB_RENDERERS 에서 호출).
export async function renderWineCellar() {
  const root = cellarRoot();
  if (!root) return;
  root.innerHTML = '<div class="wine-cellar-loading"><span></span><strong>와인 기록을 불러오는 중</strong></div>';
  try {
    await loadCellar();
    renderCellar();
  } catch (error) {
    root.innerHTML = '<div class="empty-state compact"><div>와인 기록을 불러오지 못했어요</div></div>';
    showToast(error.message || '와인 기록을 불러오지 못했어요.', 2200, 'warning');
  }
}

// ?entry=wine 딥링크 · Android 네이티브 인텐트 진입 — 이제 탭으로 이동한다.
export async function openWineCellar() {
  window.switchTab?.('wine');
}

function bindCellar(root) {
  if (!root) return;
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-wine-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.wineAction;
    const id = target.dataset.id;
    if (action === 'add-bottle') openBottleEditor();
    if (action === 'edit-bottle') openBottleEditor(id);
    if (action === 'add-tasting') openTastingEditor();
    if (action === 'edit-tasting') openTastingEditor(id);
    if (action === 'close-editor') closeEditor();
    if (action === 'delete-bottle') void removeBottle(id);
    if (action === 'delete-tasting') void removeTasting(id);
    if (action === 'bottle-from-tx') openBottleEditorFromTx(id);
    if (action === 'open-points') openWinePointModal();
  });
}

function editorHost() {
  return cellarRoot()?.querySelector('[data-wine-editor-host]');
}

// 결제 한 건에서 바로 와인 등록 — 이름/금액/날짜/거래ID 를 미리 채운다.
function openBottleEditorFromTx(txId) {
  const tx = (cellarState.purchases || []).find(row => String(row.id) === String(txId));
  if (!tx) return;
  cellarState.draft = bottleDraftFromTx(tx);
  openBottleEditor();
}

// 와인구매 포인트 사용·이력은 이미 있는 홈 포인트 모달을 재사용한다.
function openWinePointModal() {
  if (!cellarState.rewardSummary) {
    showToast('포인트 정보를 아직 불러오지 못했어요.', 2000, 'info');
    return;
  }
  winePointModalController.open('winePurchase');
}

function closeEditor() {
  cellarState.editor = null;
  editorHost()?.replaceChildren();
}

function openBottleEditor(id = null) {
  const draft = cellarState.draft;
  cellarState.draft = null;
  const bottle = id ? bottleById(id) : (draft ? { ...draft } : null);
  cellarState.editor = { type: 'bottle', id };
  cellarState.imageUrl = bottle?.imageUrl || null;
  cellarState.imageThumbnail = bottle?.imageThumbnail || null;
  const host = editorHost();
  if (!host) return;
  host.innerHTML = `
    <div class="wine-editor-backdrop">
      <section class="wine-editor-sheet" role="dialog" aria-modal="true" aria-label="와인 편집">
        <header><button type="button" data-wine-action="close-editor">취소</button><strong>${bottle ? '와인 수정' : '와인 추가'}</strong><span></span></header>
        <form data-wine-bottle-form>
          <label class="wine-photo-field">
            <span class="wine-photo-preview">${cellarState.imageThumbnail || cellarState.imageUrl ? `<img src="${escHtml(cellarState.imageThumbnail || cellarState.imageUrl)}" alt="">` : '<b>🍾</b>'}</span>
            <span><strong>라벨 사진</strong><small>선택 · 위젯용 썸네일 자동 생성</small></span>
            <input type="file" name="photo" accept="image/*" capture="environment">
          </label>
          <label><span>와인 이름 <b>필수</b></span><input name="name" maxlength="120" required value="${escHtml(bottle?.name || '')}" placeholder="예: Chianti Classico Riserva"></label>
          <div class="wine-form-grid">
            <label><span>빈티지</span><input name="vintage" type="number" min="1800" max="2200" value="${escHtml(bottle?.vintage || '')}" placeholder="2021"></label>
            <label><span>상태</span><select name="status"><option value="cellared" ${bottle?.status === 'cellared' ? 'selected' : ''}>셀러 보관</option><option value="opened" ${bottle?.status === 'opened' ? 'selected' : ''}>오픈</option><option value="finished" ${bottle?.status === 'finished' ? 'selected' : ''}>마심</option></select></label>
          </div>
          <label><span>지역</span><input name="region" maxlength="120" value="${escHtml(bottle?.region || '')}" placeholder="예: Toscana, Italia"></label>
          <label><span>품종</span><input name="variety" maxlength="120" value="${escHtml(bottle?.variety || '')}" placeholder="예: Sangiovese"></label>
          <label><span>구매가 <small>선택 · 셀러 지출 합계에 반영</small></span><input name="pricePaid" inputmode="numeric" value="${escHtml(bottle?.pricePaid || '')}" placeholder="0"></label>
          <input type="hidden" name="purchaseTxId" value="${escHtml(bottle?.purchaseTxId || '')}">
          ${bottle?.purchaseTxId ? '<p class="wine-linked-note">결제 내역과 연결된 와인이에요.</p>' : ''}
          <button class="wine-primary-button" type="submit">저장</button>
          ${bottle ? `<button class="wine-delete-button" type="button" data-wine-action="delete-bottle" data-id="${escHtml(bottle.id)}">와인과 연결된 기록 삭제</button>` : ''}
        </form>
      </section>
    </div>`;
  bindBottleForm(host.querySelector('[data-wine-bottle-form]'), bottle);
}

// 테이스팅 폼에서 새 와인을 만들 때 쓰는 센티널 — 셀러가 비어 있으면 기본값이다.
const NEW_BOTTLE_VALUE = '__new__';

// 예전 항목(한 줄 요약·향·맛·페어링·노트)에 남아 있는 값은 지우지 않고 읽기 전용으로 보여준다.
function legacyTastingHtml(tasting) {
  const rows = legacyTastingNotes(tasting || {});
  if (!rows.length) return '';
  return `
    <section class="wine-legacy-notes">
      <h4>이전에 기록한 내용</h4>
      <dl>
        ${rows.map(row => `<div><dt>${escHtml(row.label)}</dt><dd>${escHtml(row.value)}</dd></div>`).join('')}
      </dl>
      <small>지금은 쓰지 않는 항목이라 수정할 수 없지만 기록은 그대로 남아 있어요.</small>
    </section>`;
}

function openTastingEditor(id = null) {
  const tasting = id ? cellarState.tastings.find(row => row.id === id) : null;
  cellarState.editor = { type: 'tasting', id };
  const host = editorHost();
  if (!host) return;
  // 셀러가 비었거나 연결된 와인이 사라졌으면 새 와인 입력이 기본값이 된다.
  const selected = cellarState.bottles.some(bottle => bottle.id === tasting?.bottleId)
    ? tasting.bottleId
    : (cellarState.bottles.length && !tasting ? cellarState.bottles[0].id : NEW_BOTTLE_VALUE);
  const creating = selected === NEW_BOTTLE_VALUE;
  host.innerHTML = `
    <div class="wine-editor-backdrop">
      <section class="wine-editor-sheet wine-tasting-editor" role="dialog" aria-modal="true" aria-label="테이스팅 편집">
        <header><button type="button" data-wine-action="close-editor">취소</button><strong>${tasting ? '테이스팅 수정' : '테이스팅 기록'}</strong><span></span></header>
        <form data-wine-tasting-form>
          <label><span>마신 날짜 <b>필수</b></span><input name="tastedAt" type="date" required value="${escHtml(dateInputValue(tasting?.tastedAt))}"></label>
          <label><span>와인 <b>필수</b></span>
            <select name="bottleId" required>
              ${cellarState.bottles.map(bottle => `<option value="${escHtml(bottle.id)}" ${selected === bottle.id ? 'selected' : ''}>${escHtml(bottleTitle(bottle))}</option>`).join('')}
              <option value="${NEW_BOTTLE_VALUE}" ${creating ? 'selected' : ''}>＋ 새 와인 추가</option>
            </select>
          </label>
          <fieldset class="wine-new-bottle" data-wine-new-bottle ${creating ? '' : 'hidden'}>
            <legend>새 와인</legend>
            <label><span>와인 이름 <b>필수</b></span><input name="newBottleName" maxlength="120" placeholder="예: Chianti Classico Riserva"></label>
            <div class="wine-form-grid">
              <label><span>빈티지</span><input name="newBottleVintage" type="number" min="1800" max="2200" placeholder="2021"></label>
              <label><span>구매가</span><input name="newBottlePricePaid" inputmode="numeric" placeholder="0"></label>
            </div>
            <label><span>지역</span><input name="newBottleRegion" maxlength="120" placeholder="예: Toscana, Italia"></label>
            <label><span>품종</span><input name="newBottleVariety" maxlength="120" placeholder="예: Sangiovese"></label>
            <small>저장하면 셀러에도 함께 등록돼요.</small>
          </fieldset>
          <label><span>내 평점 <small>선택</small></span><input name="taewooScore" type="number" min="0.5" max="5" step="0.5" value="${escHtml(tasting?.taewooScore || '')}" placeholder="0.5–5.0"></label>
          <label><span>1차 노트 <small>첫 잔의 인상</small></span><textarea name="firstNote" maxlength="1200" placeholder="따르자마자 느낀 향과 맛">${escHtml(tasting?.firstNote || '')}</textarea></label>
          <label><span>2차 노트 <small>시간이 지난 뒤</small></span><textarea name="secondNote" maxlength="1200" placeholder="열리고 난 뒤 달라진 점">${escHtml(tasting?.secondNote || '')}</textarea></label>
          ${legacyTastingHtml(tasting)}
          <button class="wine-primary-button" type="submit">저장</button>
          ${tasting ? `<button class="wine-delete-button" type="button" data-wine-action="delete-tasting" data-id="${escHtml(tasting.id)}">테이스팅 기록 삭제</button>` : ''}
        </form>
      </section>
    </div>`;
  bindTastingForm(host.querySelector('[data-wine-tasting-form]'), tasting);
}

function bindBottleForm(form, bottle) {
  if (!form) return;
  form.elements.photo?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      [cellarState.imageUrl, cellarState.imageThumbnail] = await Promise.all([
        imageData(file, 1280, 0.84),
        imageData(file, 240, 0.76),
      ]);
      const preview = form.querySelector('.wine-photo-preview');
      preview.innerHTML = `<img src="${cellarState.imageThumbnail}" alt="">`;
    } catch (error) {
      showToast(error.message || '사진을 처리하지 못했어요.', 1800, 'warning');
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await saveWineBottle({
        ...bottle,
        ...values,
        purchasedAt: bottle?.purchasedAt || null,
        imageUrl: cellarState.imageUrl,
        imageThumbnail: cellarState.imageThumbnail,
      });
      showToast('와인을 셀러에 저장했어요.', 1600, 'success');
      await loadCellar();
      renderCellar();
    } catch (error) {
      showToast(error.message || '와인을 저장하지 못했어요.', 2200, 'warning');
      button.disabled = false;
    }
  });
}

// 새 와인 입력칸은 '＋ 새 와인 추가' 를 골랐을 때만 보이고, 그때만 이름이 필수다.
function syncNewBottleFields(form) {
  const fieldset = form.querySelector('[data-wine-new-bottle]');
  if (!fieldset) return;
  const creating = form.elements.bottleId?.value === NEW_BOTTLE_VALUE;
  fieldset.hidden = !creating;
  form.elements.newBottleName.required = creating;
}

function bindTastingForm(form, tasting) {
  if (!form) return;
  syncNewBottleFields(form);
  form.elements.bottleId?.addEventListener('change', () => syncNewBottleFields(form));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const {
        newBottleName, newBottleVintage, newBottleRegion, newBottleVariety, newBottlePricePaid,
        ...values
      } = Object.fromEntries(new FormData(form));
      if (values.bottleId === NEW_BOTTLE_VALUE) {
        values.bottleId = await saveWineBottle({
          name: newBottleName,
          vintage: newBottleVintage,
          region: newBottleRegion,
          variety: newBottleVariety,
          pricePaid: newBottlePricePaid,
        });
      }
      await saveWineTasting({ ...tasting, ...values });
      showToast('테이스팅을 날짜에 기록했어요.', 1600, 'success');
      await loadCellar();
      renderCellar();
    } catch (error) {
      showToast(error.message || '테이스팅을 저장하지 못했어요.', 2200, 'warning');
      button.disabled = false;
    }
  });
}

async function removeBottle(id) {
  if (!window.confirm('이 와인과 연결된 테이스팅 기록을 모두 삭제할까요?')) return;
  await deleteWineBottle(id);
  await loadCellar();
  renderCellar();
  showToast('와인 기록을 삭제했어요.', 1600, 'info');
}

async function removeTasting(id) {
  if (!window.confirm('이 테이스팅 기록을 삭제할까요?')) return;
  await deleteWineTasting(id);
  await loadCellar();
  renderCellar();
  showToast('테이스팅 기록을 삭제했어요.', 1600, 'info');
}

async function imageData(file, maxSize, quality) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택하세요.');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

export async function renderWineHomeCard(root) {
  if (!root) return;
  root.querySelector('[data-wine-home-card]')?.remove();
  try {
    await loadCellar();
    const latest = cellarState.tastings[0] || null;
    const bottle = latest ? bottleById(latest.bottleId) : null;
    const html = `
      <section class="home-wine-card" data-wine-home-card>
        <button type="button" data-wine-home-open>
          <span class="home-wine-art">${bottle?.imageThumbnail || bottle?.imageUrl ? `<img src="${escHtml(bottle.imageThumbnail || bottle.imageUrl)}" alt="">` : '🍷'}</span>
          <span class="home-wine-copy"><small>와인 기록</small><strong>${escHtml(latest ? bottleTitle(bottle) : '오늘의 와인을 남겨보세요')}</strong><span>${escHtml(latest ? `${displayDate(latest.tastedAt)} · ${scoreText(latest.taewooScore)}` : '날짜와 와인만으로 시작')}</span></span>
          <b>›</b>
        </button>
      </section>`;
    const body = root.querySelector('.report-body') || root;
    const hero = body.querySelector('.report-hero-card');
    if (hero) hero.insertAdjacentHTML('afterend', html);
    else body.insertAdjacentHTML('afterbegin', html);
    body.querySelector('[data-wine-home-open]')?.addEventListener('click', openWineCellar);
  } catch (error) {
    console.warn('[wine-home-card]', error);
  }
}
