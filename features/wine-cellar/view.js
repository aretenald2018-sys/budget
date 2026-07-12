import { escHtml } from '../../utils/dom.js';
import { fmtDate } from '../../utils/format.js';

export function wineTile(bottle, tastings = []) {
  const notes = tastings.filter(note => note.bottleId === bottle.id);
  return `
    <button type="button" class="wine-tile" onclick="window.openWineBottleDetail('${escHtml(bottle.id)}')">
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

export function bottleCard(bottle, tastings = []) {
  const notes = tastings.filter(note => note.bottleId === bottle.id);
  const lastNote = notes[0];
  return `
    <button type="button" class="wine-bottle-card" onclick="window.openWineBottleDetail('${escHtml(bottle.id)}')">
      <span class="wine-thumb">${bottle.imageUrl ? `<img src="${escHtml(bottle.imageUrl)}" alt="">` : '🍷'}</span>
      <span class="wine-body">
        <span class="wine-name">${escHtml(bottle.name || '이름 없는 와인')} ${bottle.vintage ? `<em>${escHtml(bottle.vintage)}</em>` : ''}</span>
        <span class="wine-meta">${[bottle.region, bottle.variety].filter(Boolean).map(escHtml).join(' · ') || '지역/품종 미입력'}</span>
        <span class="wine-note-line">${lastNote ? escHtml(lastNote.taewooSummary || lastNote.note || lastNote.palate || '시음 노트 있음') : '아직 시음 노트가 없어요'}</span>
      </span>
      <span class="wine-side">
        <span class="wine-status ${escHtml(bottle.status || 'cellared')}">${statusLabel(bottle.status)}</span>
        <span>${notes.length} notes</span>
      </span>
    </button>
  `;
}

export function tastingCard(note) {
  return `
    <button type="button" class="tasting-card" onclick="window.openWineTastingForm('${escHtml(note.bottleId)}','${escHtml(note.id)}')">
      <span class="tasting-date">${fmtDate(note.tastedAt)}</span>
      <span class="tasting-body">
        <strong>${escHtml(note.taewooSummary || note.occasion || '시음 기록')}</strong>
        <small>${escHtml(note.note || note.palate || note.nose || '감각 메모 없음')}</small>
      </span>
      <span class="tasting-score">${note.taewooScore ? `${Number(note.taewooScore) || 0}/5` : '›'}</span>
    </button>
  `;
}

export function photoField(bottle) {
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

export function input(name, label, value = '', placeholder = '', required = false, inputmode = '') {
  const type = inputmode === 'date' ? 'date' : 'text';
  return `
    <div class="field">
      <label>${escHtml(label)}</label>
      <input class="tds-input warm-input" type="${type}" name="${escHtml(name)}" value="${escHtml(value ?? '')}" placeholder="${escHtml(placeholder)}" ${required ? 'required' : ''} ${inputmode && inputmode !== 'date' ? `inputmode="${escHtml(inputmode)}"` : ''}>
    </div>
  `;
}

export function textarea(name, label, value = '', placeholder = '') {
  return `
    <div class="field">
      <label>${escHtml(label)}</label>
      <textarea class="tds-textarea warm-input" name="${escHtml(name)}" placeholder="${escHtml(placeholder)}">${escHtml(value ?? '')}</textarea>
    </div>
  `;
}

export function averageScore(tastings = []) {
  const rated = tastings.map(note => Number(note.taewooScore)).filter(Boolean);
  if (!rated.length) return '';
  return (rated.reduce((sum, score) => sum + score, 0) / rated.length).toFixed(1);
}

export function statusLabel(status) {
  if (status === 'opened') return '오픈함';
  if (status === 'finished') return '다 마심';
  return '보관 중';
}

export function emptyCellar() {
  return '<div class="empty-state"><div class="icon">🍷</div><div>아직 셀러가 비어 있어요</div><div class="st4">사고 싶은 와인을 억누르기보다, 어떤 감각을 기대하는지 먼저 담아보세요.</div></div>';
}
