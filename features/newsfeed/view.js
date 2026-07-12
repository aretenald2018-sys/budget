import { TELEGRAM_PUBLIC_SOURCES } from '../../utils/telegram-sources.js';
import { escHtml } from '../../utils/dom.js';
import { fmtDateTime, relTime } from '../../utils/format.js';
import { normalizeNewsfeedDate } from './state.js';

const CATEGORY_ORDER = [
  '리포트 및 요약 분석',
  '종합시황',
  '국내시황/스크랩',
  '미국시황',
  'Macro',
  '섹터',
  'IB',
  '마인드 컨트롤',
  '부동산',
];

export function newsfeedViewHtml(state) {
  const items = state.items || [];
  return `
    ${heroHtml(items, state.status, state)}
    ${filterHtml(state.category)}
    <div class="newsfeed-list" data-newsfeed-list>
      ${items.length ? items.map(feedCardHtml).join('') : emptyStateHtml(state.total || 0)}
    </div>
    ${paginationHtml(items, state)}
  `;
}

export function heroHtml(items, status, state) {
  const sourceCount = TELEGRAM_PUBLIC_SOURCES.length;
  const lastRunAt = normalizeNewsfeedDate(status?.lastRunAt);
  const totalItems = Number(state.total || status?.itemCount || items.length || 0);
  const latestItemAt = items.map(item => normalizeNewsfeedDate(item.postedAt)).filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  return `
    <section class="newsfeed-hero">
      <div class="newsfeed-hero-main">
        <div>
          <div class="label">공개 Telegram 뉴스</div>
          <div class="amount">${totalItems}<span class="unit">건</span></div>
        </div>
        <div class="newsfeed-hero-actions">
          <div class="newsfeed-digest-wrap">
            <button type="button" class="newsfeed-digest-btn ${state.digestMenuOpen ? 'active' : ''}" data-newsfeed-action="digest-menu" aria-label="뉴스피드 다이제스트 복사 옵션" aria-expanded="${state.digestMenuOpen ? 'true' : 'false'}" ${state.digestLoadingMode ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M8 4.8h8"></path><path d="M8 9h8"></path><path d="M8 13.2h5"></path><path d="M6.8 20h10.4A2.8 2.8 0 0 0 20 17.2V6.8A2.8 2.8 0 0 0 17.2 4H16a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2H6.8A2.8 2.8 0 0 0 4 6.8v10.4A2.8 2.8 0 0 0 6.8 20Z"></path></svg>
              <span>다이제스트</span>
            </button>
            ${state.digestMenuOpen ? digestMenuHtml(state.digestLoadingMode) : ''}
          </div>
          <button type="button" class="newsfeed-refresh-btn" data-newsfeed-action="refresh" aria-label="뉴스피드 새로고침">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.3 6"></path><path d="M4 12a8 8 0 0 1 13.3-6"></path><path d="M17 2.8V6h-3.2"></path><path d="M7 21.2V18h3.2"></path></svg>
          </button>
        </div>
      </div>
      <div class="newsfeed-hero-meta">
        <span>${sourceCount}개 공개 채널</span>
        <span>${lastRunAt ? `수집 ${relTime(lastRunAt)}` : '수집 대기'}</span>
        <span>${latestItemAt ? `최신 글 ${relTime(latestItemAt)}` : '저장된 글 없음'}</span>
        ${status?.truncated ? '<span>일부만 표시</span>' : ''}
      </div>
    </section>
  `;
}

export function filterHtml(activeCategory = 'all') {
  const counts = new Map();
  for (const source of TELEGRAM_PUBLIC_SOURCES) {
    counts.set(source.category, (counts.get(source.category) || 0) + 1);
  }
  const categories = CATEGORY_ORDER.filter(category => counts.has(category))
    .concat([...counts.keys()].filter(category => !CATEGORY_ORDER.includes(category)).sort());
  return `
    <div class="newsfeed-filter" role="tablist" aria-label="뉴스피드 카테고리">
      ${filterButton('all', '전체', TELEGRAM_PUBLIC_SOURCES.length, activeCategory)}
      ${categories.map(category => filterButton(category, category, counts.get(category) || 0, activeCategory)).join('')}
    </div>
  `;
}

export function feedCardHtml(item) {
  const postedAt = normalizeNewsfeedDate(item.postedAt);
  const text = String(item.text || '').trim();
  const summary = text || '본문 없는 Telegram 메시지입니다.';
  const links = Array.isArray(item.links) ? item.links.filter(link => link?.url).slice(0, 2) : [];
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  return `
    <article class="newsfeed-card">
      <div class="newsfeed-card-head">
        <div class="newsfeed-source-mark">${sourceInitial(item.sourceTitle)}</div>
        <div class="newsfeed-source-body">
          <div class="newsfeed-source-line">
            <strong>${escHtml(item.sourceTitle || 'Telegram')}</strong>
            <span>${escHtml(item.sourceCategory || '뉴스')}</span>
          </div>
          <div class="newsfeed-time">${postedAt ? `${fmtDateTime(postedAt)} · ${relTime(postedAt)}` : '시간 정보 없음'}</div>
        </div>
      </div>
      <a class="newsfeed-title" href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escHtml(item.title || firstLine(summary))}</a>
      <div class="newsfeed-text">${escHtml(summary)}</div>
      ${attachments.length || links.length ? `
        <div class="newsfeed-card-foot">
          ${attachments.length ? `<span class="newsfeed-pill">${attachmentsLabel(attachments)}</span>` : ''}
          ${links.map(link => `<a class="newsfeed-link-pill" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escHtml(link.label || link.url)}</a>`).join('')}
        </div>
      ` : ''}
    </article>
  `;
}

export function errorStateHtml(err) {
  return `
    <div class="empty-state newsfeed-empty">
      <div class="icon">!</div>
      <div>뉴스피드를 불러오지 못했습니다</div>
      <div class="st4">${escHtml(err?.message || 'Firestore 응답을 확인하세요.')}</div>
      <button type="button" class="tds-btn sm secondary" data-tab-retry="newsfeed">다시 시도</button>
    </div>
  `;
}

function digestMenuHtml(loadingMode) {
  return `
    <div class="newsfeed-digest-menu" data-newsfeed-digest-menu>
      ${digestOptionButton('daily', '일일 복사', '최신 KST 날짜 전수', loadingMode)}
      ${digestOptionButton('weekly', '주간 복사', '최근 7개 KST 날짜', loadingMode)}
      <div class="newsfeed-digest-note">문서/PDF 본문 미수집</div>
    </div>
  `;
}

function digestOptionButton(mode, label, sublabel, loadingMode) {
  const loading = loadingMode === mode;
  return `
    <button type="button" class="newsfeed-digest-option" data-newsfeed-digest="${mode}" ${loadingMode ? 'disabled' : ''}>
      <span>${loading ? '<span class="loading-spinner mini"></span>' : ''}${escHtml(label)}</span>
      <em>${escHtml(sublabel)}</em>
    </button>
  `;
}

function filterButton(value, label, count, activeCategory) {
  const active = activeCategory === value;
  return `
    <button type="button" class="newsfeed-filter-chip ${active ? 'active' : ''}" data-newsfeed-category="${escHtml(value)}" aria-selected="${active ? 'true' : 'false'}">
      <span>${escHtml(label)}</span>
      <em>${Number(count || 0)}</em>
    </button>
  `;
}

function emptyStateHtml(totalItems) {
  if (totalItems > 0) {
    return `
      <div class="empty-state newsfeed-empty">
        <div class="icon">!</div>
        <div>이 카테고리에는 아직 저장된 글이 없습니다</div>
        <div class="st4">전체 탭을 보거나 다음 수집 주기를 기다리세요.</div>
      </div>
    `;
  }
  return `
    <div class="empty-state newsfeed-empty">
      <div class="icon">!</div>
      <div>아직 수집된 뉴스가 없습니다</div>
      <div class="st4">GitHub Actions의 Telegram public feed job이 실행되면 최신 글이 여기에 쌓입니다.</div>
    </div>
  `;
}

function paginationHtml(items, state) {
  if (!items.length) return '';
  if (state.loadingMore) {
    return `
      <div class="newsfeed-pagination">
        <button type="button" class="newsfeed-load-more" disabled>
          <span class="loading-spinner mini"></span>
          <span>불러오는 중</span>
        </button>
      </div>
    `;
  }
  if (state.hasMore) {
    return `
      <div class="newsfeed-pagination">
        <button type="button" class="newsfeed-load-more" data-newsfeed-action="load-more">더 보기</button>
      </div>
    `;
  }
  return `
    <div class="newsfeed-pagination done">
      ${state.total ? `${items.length} / ${state.total}건 표시` : '마지막 글까지 표시했습니다'}
    </div>
  `;
}

function attachmentsLabel(attachments) {
  const counts = attachments.reduce((acc, item) => {
    const type = item?.type || 'file';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([type, count]) => `${attachmentTypeLabel(type)} ${count}`).join(' · ');
}

function attachmentTypeLabel(type) {
  if (type === 'image') return '이미지';
  if (type === 'video') return '영상';
  if (type === 'document') return '문서';
  return '첨부';
}

function sourceInitial(value) {
  return escHtml(String(value || 'T').trim().slice(0, 1).toUpperCase() || 'T');
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
}

function escAttr(value) {
  return escHtml(value).replace(/`/g, '&#96;');
}
