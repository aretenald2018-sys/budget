import {
  deleteWineBottle,
  deleteWineTasting,
  listWineBottles,
  listWineTastings,
  saveWineBottle,
  saveWineTasting,
} from '../../data.js';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

let cellarState = { bottles: [], tastings: [], editor: null, imageUrl: null, imageThumbnail: null };

function modalHost() {
  return document.getElementById('modals-container');
}

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
  return cellarState;
}

function bottleTitle(bottle) {
  return [bottle?.name || '이름 없는 와인', bottle?.vintage || ''].filter(Boolean).join(' · ');
}

function tastingCard(tasting) {
  const bottle = bottleById(tasting.bottleId) || {};
  const note = tasting.taewooSummary || tasting.note || tasting.nose || '기억해 둘 한 줄을 남겨보세요.';
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
    <section class="wine-cellar-screen" role="dialog" aria-modal="true" aria-label="와인 기록">
      <header class="wine-screen-header">
        <button type="button" class="wine-icon-button" data-wine-action="close" aria-label="닫기">‹</button>
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

function renderCellar() {
  const host = modalHost();
  if (!host) return;
  host.querySelector('.wine-cellar-screen')?.remove();
  host.insertAdjacentHTML('beforeend', cellarHtml());
  bindCellar(host.querySelector('.wine-cellar-screen'));
}

export async function openWineCellar() {
  const host = modalHost();
  if (!host) return;
  host.insertAdjacentHTML('beforeend', '<div class="wine-cellar-loading"><span></span><strong>와인 기록을 불러오는 중</strong></div>');
  try {
    await loadCellar();
    host.querySelector('.wine-cellar-loading')?.remove();
    renderCellar();
  } catch (error) {
    host.querySelector('.wine-cellar-loading')?.remove();
    showToast(error.message || '와인 기록을 불러오지 못했어요.', 2200, 'warning');
  }
}

function closeCellar() {
  modalHost()?.querySelector('.wine-cellar-screen')?.remove();
}

function bindCellar(root) {
  if (!root) return;
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-wine-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.wineAction;
    const id = target.dataset.id;
    if (action === 'close') closeCellar();
    if (action === 'add-bottle') openBottleEditor();
    if (action === 'edit-bottle') openBottleEditor(id);
    if (action === 'add-tasting') openTastingEditor();
    if (action === 'edit-tasting') openTastingEditor(id);
    if (action === 'close-editor') closeEditor();
    if (action === 'delete-bottle') void removeBottle(id);
    if (action === 'delete-tasting') void removeTasting(id);
  });
}

function editorHost() {
  return modalHost()?.querySelector('[data-wine-editor-host]');
}

function closeEditor() {
  cellarState.editor = null;
  editorHost()?.replaceChildren();
}

function openBottleEditor(id = null) {
  const bottle = id ? bottleById(id) : null;
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
          <button class="wine-primary-button" type="submit">저장</button>
          ${bottle ? `<button class="wine-delete-button" type="button" data-wine-action="delete-bottle" data-id="${escHtml(bottle.id)}">와인과 연결된 기록 삭제</button>` : ''}
        </form>
      </section>
    </div>`;
  bindBottleForm(host.querySelector('[data-wine-bottle-form]'), bottle);
}

function openTastingEditor(id = null) {
  if (!cellarState.bottles.length) {
    showToast('먼저 와인을 추가해 주세요.', 1800, 'info');
    openBottleEditor();
    return;
  }
  const tasting = id ? cellarState.tastings.find(row => row.id === id) : null;
  cellarState.editor = { type: 'tasting', id };
  const host = editorHost();
  if (!host) return;
  host.innerHTML = `
    <div class="wine-editor-backdrop">
      <section class="wine-editor-sheet wine-tasting-editor" role="dialog" aria-modal="true" aria-label="테이스팅 편집">
        <header><button type="button" data-wine-action="close-editor">취소</button><strong>${tasting ? '테이스팅 수정' : '테이스팅 기록'}</strong><span></span></header>
        <form data-wine-tasting-form>
          <label><span>마신 날짜 <b>필수</b></span><input name="tastedAt" type="date" required value="${escHtml(dateInputValue(tasting?.tastedAt))}"></label>
          <label><span>와인 <b>필수</b></span><select name="bottleId" required>${cellarState.bottles.map(bottle => `<option value="${escHtml(bottle.id)}" ${tasting?.bottleId === bottle.id ? 'selected' : ''}>${escHtml(bottleTitle(bottle))}</option>`).join('')}</select></label>
          <label><span>내 평점 <small>선택</small></span><input name="taewooScore" type="number" min="0.5" max="5" step="0.5" value="${escHtml(tasting?.taewooScore || '')}" placeholder="0.5–5.0"></label>
          <label><span>한 줄 요약 <small>선택</small></span><input name="taewooSummary" maxlength="240" value="${escHtml(tasting?.taewooSummary || '')}" placeholder="오늘 이 와인을 기억할 한 문장"></label>
          <label><span>향</span><textarea name="nose" maxlength="240" placeholder="체리, 말린 허브, 가죽">${escHtml(tasting?.nose || '')}</textarea></label>
          <label><span>맛</span><textarea name="palate" maxlength="240" placeholder="산도, 탄닌, 질감, 여운">${escHtml(tasting?.palate || '')}</textarea></label>
          <label><span>페어링</span><input name="pairing" maxlength="160" value="${escHtml(tasting?.pairing || '')}" placeholder="함께 먹은 음식"></label>
          <label><span>노트</span><textarea name="note" maxlength="1200" placeholder="조금 더 자세한 기억">${escHtml(tasting?.note || '')}</textarea></label>
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
        imageUrl: cellarState.imageUrl,
        imageThumbnail: cellarState.imageThumbnail,
      });
      document.dispatchEvent(new CustomEvent('wine:changed'));
      showToast('와인을 셀러에 저장했어요.', 1600, 'success');
      await loadCellar();
      renderCellar();
    } catch (error) {
      showToast(error.message || '와인을 저장하지 못했어요.', 2200, 'warning');
      button.disabled = false;
    }
  });
}

function bindTastingForm(form, tasting) {
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await saveWineTasting({ ...tasting, ...values });
      document.dispatchEvent(new CustomEvent('wine:changed'));
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
  document.dispatchEvent(new CustomEvent('wine:changed'));
  await loadCellar();
  renderCellar();
  showToast('와인 기록을 삭제했어요.', 1600, 'info');
}

async function removeTasting(id) {
  if (!window.confirm('이 테이스팅 기록을 삭제할까요?')) return;
  await deleteWineTasting(id);
  document.dispatchEvent(new CustomEvent('wine:changed'));
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
