// ================================================================
// urge/render-wine-cellar.js — Sensory Bank wine cellar
// ================================================================

import {
  deleteWineBottle,
  deleteWineTasting,
  getWineBottle,
  listWineBottles,
  listWineTastings,
  saveWineBottle,
  saveWineTasting,
} from '../data.js';
import { fmtDate, fmtKRW } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';

const STATE = { bottles: [], tastings: [], photoDraft: '' };
let currentRoot = null;

export async function renderWineCellar(root = wineRoot()) {
  currentRoot = root || $('#tab-mindbank');
  root = currentRoot;
  const embedded = isChoiceCellarRoot(root);
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const [bottles, tastings] = await Promise.all([
    listWineBottles({ max: 100 }),
    listWineTastings({ max: 100 }),
  ]);
  STATE.bottles = bottles;
  STATE.tastings = tastings;
  const opened = bottles.filter(b => b.status === 'opened' || b.status === 'finished').length;
  const cellared = bottles.filter(b => b.status === 'cellared').length;
  const avgScore = averageScore(tastings);

  root.innerHTML = `
    <div class="sensory-top">
      <div>
        <div class="sensory-kicker">감각뱅크</div>
        <div class="sensory-title">와인 셀러</div>
        <div class="sensory-sub">구매한 병과 마신 경험을 따로 남겨요.</div>
      </div>
      <button type="button" class="tds-btn sm tonal" onclick="window.openWineBottleForm()">병 추가</button>
    </div>

    ${embedded ? '' : `<div class="sensory-tabs">
      <button type="button" onclick="window.openSensoryBank('choices')">좋은 선택</button>
      <button type="button" class="active">와인 셀러</button>
    </div>`}

    <section class="hero wine-hero">
      <div class="label">이번 격주 보유</div>
      <div class="amount">${cellared}<span class="unit">병 / ${bottles.length}병</span></div>
      <div class="sub">
        <span>마신 병 <b>${opened}</b></span>
        <span>구매 기록 <b>${bottles.length}</b></span>
        <span>평균 만족 <b>${avgScore || '-'}</b></span>
      </div>
      <div class="pace">● 감각을 돈 쓴 뒤가 아니라 쓰기 전부터 기록합니다</div>
    </section>

    <button type="button" class="sensory-note-cta" onclick="window.openWineBottleForm()">
      <span class="ico">+</span>
      <span><strong>구매한 와인 담기</strong><small>마신 날이 아니어도 괜찮아요. 일단 셀러에 보관해요.</small></span>
    </button>

    <div class="section-title"><h3>현재 셀러</h3><button type="button" class="more" onclick="window.openWineBottleForm()">정리 ›</button></div>
    ${bottles.length ? `<div class="wine-grid">${bottles.slice(0, 6).map(wineTile).join('')}</div>` : emptyCellar()}

    <div class="section-title"><h3>최근 기록</h3></div>
    ${bottles.length ? bottles.map(bottleCard).join('') : ''}
  `;
}

function wineTile(bottle) {
  const notes = STATE.tastings.filter(note => note.bottleId === bottle.id);
  return `
    <button type="button" class="wine-tile" onclick="window.openWineBottleDetail('${bottle.id}')">
      <span class="wine-tile-neck"></span>
      <span class="wine-tile-body">
        ${bottle.imageUrl ? `<img src="${escHtml(bottle.imageUrl)}" alt="">` : '<span>🍷</span>'}
      </span>
      <strong>${escHtml(bottle.name || '이름 없는 와인')}</strong>
      <em>${escHtml([bottle.vintage, bottle.region].filter(Boolean).join(' · ') || statusLabel(bottle.status))}</em>
      ${notes.length ? '<i>★</i>' : ''}
    </button>
  `;
}

function bottleCard(bottle) {
  const notes = STATE.tastings.filter(note => note.bottleId === bottle.id);
  const lastNote = notes[0];
  return `
    <button type="button" class="wine-bottle-card" onclick="window.openWineBottleDetail('${bottle.id}')">
      <span class="wine-thumb">${bottle.imageUrl ? `<img src="${escHtml(bottle.imageUrl)}" alt="">` : '🍷'}</span>
      <span class="wine-body">
        <span class="wine-name">${escHtml(bottle.name || '이름 없는 와인')} ${bottle.vintage ? `<em>${bottle.vintage}</em>` : ''}</span>
        <span class="wine-meta">${[bottle.region, bottle.variety].filter(Boolean).map(escHtml).join(' · ') || '지역/품종 미입력'}</span>
        <span class="wine-note-line">${lastNote ? escHtml(lastNote.taewooSummary || lastNote.note || lastNote.palate || '시음 노트 있음') : '아직 시음 노트가 없어요'}</span>
      </span>
      <span class="wine-side">
        <span class="wine-status ${bottle.status || 'cellared'}">${statusLabel(bottle.status)}</span>
        <span>${notes.length} notes</span>
      </span>
    </button>
  `;
}

async function openBottleDetail(bottleId) {
  const root = wineRoot();
  const bottle = await getWineBottle(bottleId);
  if (!bottle) {
    showToast('와인을 찾을 수 없어요.', 1800, 'warning');
    return renderWineCellar(root);
  }
  const tastings = await listWineTastings({ bottleId, max: 50 });
  root.innerHTML = `
    <div class="mindbank-detail">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="window.openWineCellarView()">‹</button>
        <div>와인 상세</div>
        <button type="button" class="tds-text-btn" onclick="window.openWineBottleForm('${bottle.id}')">수정</button>
      </div>

      <div class="wine-detail-hero">
        <div class="wine-detail-thumb">${bottle.imageUrl ? `<img src="${escHtml(bottle.imageUrl)}" alt="">` : '🍷'}</div>
        <div class="wine-detail-main">
          <div class="wine-detail-name">${escHtml(bottle.name || '이름 없는 와인')}</div>
          <div class="wine-detail-meta">${[bottle.vintage, bottle.region, bottle.variety].filter(Boolean).map(escHtml).join(' · ')}</div>
          <div class="wine-detail-tags">
            <span>${statusLabel(bottle.status)}</span>
            ${bottle.price ? `<span>${fmtKRW(bottle.price)}</span>` : ''}
            ${bottle.merchant ? `<span>${escHtml(bottle.merchant)}</span>` : ''}
          </div>
        </div>
      </div>

      <button type="button" class="tds-btn full" onclick="window.openWineTastingForm('${bottle.id}')">시음 노트 쓰기</button>

      <div class="section-title">시음 노트</div>
      ${tastings.length ? tastings.map(tastingCard).join('') : '<div class="empty-state"><div class="icon">🍷</div><div>아직 마신 기록은 없어요</div><div class="st4">오픈한 날의 향, 맛, 기분을 따로 남겨보세요.</div></div>'}

      <button type="button" class="tds-btn danger full mt-lg" onclick="window.deleteWineBottleFromDetail('${bottle.id}')">이 병 삭제</button>
    </div>
  `;
}

function tastingCard(note) {
  return `
    <button type="button" class="tasting-card" onclick="window.openWineTastingForm('${note.bottleId}','${note.id}')">
      <span class="tasting-date">${fmtDate(note.tastedAt)}</span>
      <span class="tasting-body">
        <strong>${escHtml(note.taewooSummary || note.occasion || '시음 기록')}</strong>
        <small>${escHtml(note.note || note.palate || note.nose || '감각 메모 없음')}</small>
      </span>
      <span class="tasting-score">${note.taewooScore ? `${note.taewooScore}/5` : '›'}</span>
    </button>
  `;
}

async function openBottleForm(bottleId = '') {
  const root = wineRoot();
  const bottle = bottleId ? await getWineBottle(bottleId) : null;
  STATE.photoDraft = bottle?.imageUrl || '';
  root.innerHTML = `
    <div class="mindbank-detail">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="${bottleId ? `window.openWineBottleDetail('${bottleId}')` : `window.openWineCellarView()`}">‹</button>
        <div>${bottleId ? '와인 수정' : '와인 담기'}</div>
        <span></span>
      </div>
      <form id="wine-bottle-form" class="sensory-form">
        ${input('name', '와인 이름', bottle?.name, '예: The Hilt Estate Pinot Noir', true)}
        ${input('vintage', '빈티지', bottle?.vintage, '2020', false, 'numeric')}
        ${input('region', '지역', bottle?.region, '예: 부르고뉴, 프랑스')}
        ${input('variety', '품종', bottle?.variety, '예: Pinot Noir')}
        ${input('price', '구매금액', bottle?.price, '85000', false, 'numeric')}
        ${input('merchant', '구매처', bottle?.merchant, '예: 와인앤모어')}
        <div class="field">
          <label>상태</label>
          <select class="tds-select" name="status">
            ${['cellared', 'opened', 'finished'].map(status => `<option value="${status}" ${bottle?.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
          </select>
        </div>
        ${input('acquiredAt', '구매/등록일', fmtDate(bottle?.acquiredAt) || new Date().toISOString().slice(0, 10), '', false, 'date')}
        ${photoField(bottle)}
        <button class="tds-btn full mt-lg" type="submit">저장</button>
      </form>
    </div>
  `;
  bindBottlePhoto(root);
  $('#wine-bottle-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = await saveWineBottle({
      id: bottleId || null,
      name: fd.get('name'),
      vintage: fd.get('vintage'),
      region: fd.get('region'),
      variety: fd.get('variety'),
      price: fd.get('price'),
      merchant: fd.get('merchant'),
      status: fd.get('status'),
      acquiredAt: fd.get('acquiredAt'),
      imageUrl: fd.get('imageUrl') || null,
    });
    showToast('와인 셀러에 저장했어요.', 1500, 'success');
    openBottleDetail(id);
  });
}

function photoField(bottle) {
  const imageUrl = bottle?.imageUrl || '';
  return `
    <div class="field wine-photo-field">
      <label>라벨 사진</label>
      <div class="wine-photo-editor">
        <div class="wine-photo-preview" data-photo-preview>
          ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="">` : '<span>🍷</span>'}
        </div>
        <div class="wine-photo-actions">
          <input type="hidden" name="imageUrl" value="${escHtml(imageUrl)}">
          <input class="wine-photo-file" type="file" accept="image/*" data-photo-file>
          <button type="button" class="tds-btn sm tonal" data-photo-pick>사진 선택</button>
          <button type="button" class="tds-btn sm secondary" data-photo-url>URL 붙여넣기</button>
          <button type="button" class="tds-btn sm ghost" data-photo-remove>사진 삭제</button>
        </div>
      </div>
      <div class="photo-hint">선택한 사진은 작게 압축해서 와인 기록에 함께 저장돼요.</div>
    </div>
  `;
}

function bindBottlePhoto(root) {
  const form = $('#wine-bottle-form', root);
  const hidden = form.querySelector('[name=imageUrl]');
  const preview = form.querySelector('[data-photo-preview]');
  const fileInput = form.querySelector('[data-photo-file]');
  const setPhoto = (url) => {
    STATE.photoDraft = url || '';
    hidden.value = STATE.photoDraft;
    preview.innerHTML = STATE.photoDraft ? `<img src="${escHtml(STATE.photoDraft)}" alt="">` : '<span>🍷</span>';
  };

  form.querySelector('[data-photo-pick]').addEventListener('click', () => fileInput.click());
  form.querySelector('[data-photo-remove]').addEventListener('click', () => {
    if (hidden.value && !confirm('저장하면 이 와인 기록에서 사진이 삭제됩니다. 삭제할까요?')) return;
    setPhoto('');
  });
  form.querySelector('[data-photo-url]').addEventListener('click', () => {
    const url = prompt('라벨 이미지 URL을 붙여넣어 주세요.', hidden.value || '');
    if (url === null) return;
    if (!url.trim() && hidden.value && !confirm('저장하면 이 와인 기록에서 사진이 삭제됩니다. 삭제할까요?')) return;
    setPhoto(url.trim());
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      setPhoto(await compressImageFile(file));
      showToast('사진을 불러왔어요.', 1200, 'success');
    } catch (err) {
      console.error('[wine-photo]', err);
      showToast('사진을 불러오지 못했어요.', 1800, 'error');
    } finally {
      fileInput.value = '';
    }
  });
}

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일이 아닙니다.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
      img.onload = () => {
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function openTastingForm(bottleId, noteId = '') {
  const root = wineRoot();
  const bottle = await getWineBottle(bottleId);
  const notes = noteId ? await listWineTastings({ bottleId, max: 50 }) : [];
  const note = notes.find(item => item.id === noteId) || null;
  root.innerHTML = `
    <div class="mindbank-detail">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="window.openWineBottleDetail('${bottleId}')">‹</button>
        <div>${noteId ? '노트 수정' : '시음 노트'}</div>
        <span></span>
      </div>
      <div class="sensory-form-intro">
        <strong>${escHtml(bottle?.name || '이 와인')}</strong>
        <span>구매 기록과 별개로, 오늘 실제로 느낀 감각만 남겨요.</span>
      </div>
      <form id="wine-tasting-form" class="sensory-form">
        ${input('tastedAt', '마신 날', fmtDate(note?.tastedAt) || new Date().toISOString().slice(0, 10), '', false, 'date')}
        ${input('occasion', '상황', note?.occasion, '예: 금요일 밤, 혼자 천천히')}
        ${input('moodBefore', '마시기 전 기분', note?.moodBefore, '예: 지쳐서 보상받고 싶었음')}
        ${input('moodAfter', '마신 뒤 기분', note?.moodAfter, '예: 몸이 느슨해지고 만족감이 남음')}
        ${input('color', '색', note?.color, '예: 짙은 루비색')}
        ${textarea('nose', '향', note?.nose, '처음 올라온 향, 시간이 지난 뒤의 향')}
        ${textarea('palate', '맛과 질감', note?.palate, '산미, 탄닌, 단맛, 알코올감, 여운')}
        <div class="wine-structure-grid">
          ${input('sweetness', '당도', note?.structure?.sweetness, '0-5', false, 'decimal')}
          ${input('tannin', '탄닌', note?.structure?.tannin, '0-5', false, 'decimal')}
          ${input('acidity', '산도', note?.structure?.acidity, '0-5', false, 'decimal')}
          ${input('alcohol', '알코올감', note?.structure?.alcohol, '0-5', false, 'decimal')}
        </div>
        ${input('pairing', '함께한 것', note?.pairing, '음식, 음악, 사람, 장소')}
        ${textarea('note', '좋았던 점', note?.note, '왜 좋았는지, 다시 사고 싶은지')}
        ${input('taewooSummary', '한 줄 요약', note?.taewooSummary, '예: 차분하고 긴 여운이 좋은 피노')}
        ${input('taewooScore', '만족도', note?.taewooScore, '0-5', false, 'decimal')}
        <button class="tds-btn full mt-lg" type="submit">노트 저장</button>
        ${noteId ? `<button class="tds-btn danger full mt-md" type="button" onclick="window.deleteWineTastingFromForm('${noteId}','${bottleId}')">노트 삭제</button>` : ''}
      </form>
    </div>
  `;
  $('#wine-tasting-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await saveWineTasting({
      id: noteId || null,
      bottleId,
      tastedAt: fd.get('tastedAt'),
      occasion: fd.get('occasion'),
      moodBefore: fd.get('moodBefore'),
      moodAfter: fd.get('moodAfter'),
      color: fd.get('color'),
      nose: fd.get('nose'),
      palate: fd.get('palate'),
      structure: {
        sweetness: fd.get('sweetness'),
        tannin: fd.get('tannin'),
        acidity: fd.get('acidity'),
        alcohol: fd.get('alcohol'),
      },
      pairing: fd.get('pairing'),
      note: fd.get('note'),
      taewooSummary: fd.get('taewooSummary'),
      taewooScore: fd.get('taewooScore'),
    });
    await saveWineBottle({ ...bottle, id: bottleId, status: bottle?.status === 'cellared' ? 'opened' : bottle?.status });
    showToast('시음 노트를 저장했어요.', 1500, 'success');
    openBottleDetail(bottleId);
  });
}

async function deleteBottleFromDetail(bottleId) {
  if (!confirm('이 병과 연결된 시음 노트를 모두 삭제할까요?')) return;
  await deleteWineBottle(bottleId);
  showToast('삭제됨', 1400, 'success');
  renderWineCellar();
}

async function deleteTastingFromForm(noteId, bottleId) {
  if (!confirm('이 시음 노트를 삭제할까요?')) return;
  await deleteWineTasting(noteId);
  showToast('삭제됨', 1400, 'success');
  openBottleDetail(bottleId);
}

function input(name, label, value = '', placeholder = '', required = false, inputmode = '') {
  const type = inputmode === 'date' ? 'date' : 'text';
  return `
    <div class="field">
      <label>${label}</label>
      <input class="tds-input warm-input" type="${type}" name="${name}" value="${escHtml(value ?? '')}" placeholder="${escHtml(placeholder)}" ${required ? 'required' : ''} ${inputmode && inputmode !== 'date' ? `inputmode="${inputmode}"` : ''}>
    </div>
  `;
}

function textarea(name, label, value = '', placeholder = '') {
  return `
    <div class="field">
      <label>${label}</label>
      <textarea class="tds-textarea warm-input" name="${name}" placeholder="${escHtml(placeholder)}">${escHtml(value ?? '')}</textarea>
    </div>
  `;
}

function averageScore(tastings) {
  const rated = tastings.map(n => Number(n.taewooScore)).filter(Boolean);
  if (!rated.length) return '';
  return (rated.reduce((sum, n) => sum + n, 0) / rated.length).toFixed(1);
}

function statusLabel(status) {
  if (status === 'opened') return '오픈함';
  if (status === 'finished') return '다 마심';
  return '보관 중';
}

function emptyCellar() {
  return '<div class="empty-state"><div class="icon">🍷</div><div>아직 셀러가 비어 있어요</div><div class="st4">사고 싶은 와인을 억누르기보다, 어떤 감각을 기대하는지 먼저 담아보세요.</div></div>';
}

function wineRoot() {
  return currentRoot && document.body.contains(currentRoot) ? currentRoot : $('#tab-mindbank');
}

function isChoiceCellarRoot(root) {
  return root?.id === 'choice-wine-cellar-root';
}

window.openWineCellarView = () => renderWineCellar(wineRoot());
window.openWineBottleDetail = openBottleDetail;
window.openWineBottleForm = openBottleForm;
window.openWineTastingForm = openTastingForm;
window.deleteWineBottleFromDetail = deleteBottleFromDetail;
window.deleteWineTastingFromForm = deleteTastingFromForm;
