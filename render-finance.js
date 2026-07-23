// ================================================================
// render-finance.js — long-term finance direction tab
// ================================================================

import {
  listFinanceGoals,
  listFinanceBenchmarks,
  listFinanceActuals,
  listFinanceAssetTracks,
  getCategories,
} from './data.js';
import { formatManwonFromKRW } from './utils/finance-goals.js';
import {
  actualGapAtTargetYear,
  buildActualSeries,
  buildScenarioSeries,
  financeChart,
  heroBasisSeries,
  scenarioInsightPanel,
} from './features/finance/projection/index.js';
import { portfolioPolicyCard } from './features/finance/portfolio/index.js';
import { financeState as STATE } from './features/finance/state.js';
import { bindFinanceController } from './features/finance/controller.js';
import {
  actualSheet,
  inputField,
  latestActualRecord,
  scenarioEditorModal,
  scenarioManagerBody,
  scenarioManagerSummary,
} from './features/finance/editors/index.js';
import { $, escHtml } from './utils/dom.js';
import { loadMarketQuotes, marketSymbols, portfolioSnapshotWithFx } from './utils/market-data.js';

export async function renderFinance() {
  const root = $('#tab-finance');
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const [goals, benchmarks, actuals, assetTracks] = await Promise.all([
    listFinanceGoals({ max: 10 }).catch(() => []),
    listFinanceBenchmarks({ max: 50 }).catch(() => []),
    listFinanceActuals({ max: 50 }).catch(() => []),
    listFinanceAssetTracks({ max: 50 }).catch(() => []),
  ]);
  const market = await loadMarketQuotes(marketSymbols(assetTracks)).catch(() => ({ quotes: {}, fx: 1450, updatedAt: null, source: '시세 연결 대기' }));
  const goal = goals.find(item => item.active !== false) || goals[0] || null;
  STATE.activeGoalId = goal?.id || null;
  STATE.activeGoalName = goal?.name || '';
  STATE.targetScenarioId = goal?.heroBenchmarkId || null;
  STATE.scenarios = benchmarks;
  STATE.assetTracks = assetTracks;
  const scenarioSeries = buildScenarioSeries(benchmarks, goal?.heroBenchmarkId);
  const actualSeries = buildActualSeries(actuals);
  const heroSeries = heroBasisSeries(goal, scenarioSeries);
  const chartTarget = heroSeries || scenarioSeries[0] || null;
  const compareSeries = STATE.compareScenarioId === chartTarget?.id
    ? null
    : scenarioSeries.find(item => item.id === STATE.compareScenarioId) || null;
  const categories = getCategories();
  const portfolio = portfolioSnapshotWithFx(assetTracks, market);
  const heroLast = heroSeries?.rows.at(-1)?.balance || 0;
  const gap = actualGapAtTargetYear(heroSeries, actuals);
  const hasActual = actuals.some(item => Number(item.cumulativeSaved) || Number(item.netWorth));
  const heroAmountText = gap == null
    ? (hasActual ? latestActualText(actuals) : '실적 입력')
    : `${gap >= 0 ? '+' : '-'}${formatPlainKRW(Math.abs(gap))}`;
  const heroAmountUnit = gap == null ? '' : '원';
  if (!['scenario', 'asset'].includes(STATE.panel)) STATE.panel = 'scenario';

  root.innerHTML = `
    <div class="finance-screen">
      <section class="hero finance-hero">
        <div>
          <div class="label">목표 자산까지</div>
          <div class="amount">${heroAmountText}<span class="unit">${heroAmountUnit}</span></div>
          <div class="sub">
            <span>현재 <b>${latestActualText(actuals)}</b></span>
            <span>목표 <b>${heroSeries ? formatManwonFromKRW(heroLast) : '-'}</b></span>
          </div>
          <div class="pace">${gap == null || gap < 0 ? '● 목표 기준 보정 필요' : '● 목표선보다 앞서가는 중'}</div>
        </div>
      </section>

      <div class="segmented finance-main-tabs">
        ${financePanelButton('scenario', '시나리오')}
        ${financePanelButton('asset', '자산')}
      </div>

      ${financePanelContent({ benchmarks, goal, chartTarget, actualSeries, compareSeries, portfolio, market, assetTracks, categories, heroSeries, actuals })}

      ${actualSheet(actuals, heroSeries, categories, STATE)}
      ${assetImportReviewSheet(assetTracks)}
      ${scenarioEditorModal(benchmarks, STATE)}
    </div>
  `;
  bindFinanceController(root, renderFinance);
}


function financePanelContent(ctx) {
  if (STATE.panel === 'asset') {
    return `
      <section class="finance-card finance-asset-card">
        ${assetOperationsCard(ctx.portfolio, ctx.market, ctx.assetTracks)}
      </section>
    `;
  }
  return `
      <section class="finance-card">
        <div class="finance-card-head">
          <div>
            <div class="h">시뮬레이션</div>
          </div>
          <button type="button" class="tds-btn sm secondary" data-finance-action="open-actual-sheet">실적 업데이트</button>
        </div>
        ${financeChart(ctx.chartTarget, ctx.actualSeries[0], ctx.compareSeries)}
        ${scenarioInsightPanel(ctx.chartTarget, STATE.scenarios)}
        <div class="finance-scenario-manager">
          <button type="button" class="finance-card-head finance-card-toggle" data-finance-action="toggle-scenario-manager">
            <div>
              <div class="h">시뮬레이션 관리</div>
              <div class="sub">가정은 필요할 때만 펼쳐서 추가·수정하고, 목표 기준을 바꿉니다.</div>
            </div>
            <span class="chev">${STATE.scenarioManagerOpen ? '⌃' : '⌄'}</span>
          </button>
          ${STATE.scenarioManagerOpen ? scenarioManagerBody(ctx.benchmarks, ctx.goal, STATE) : scenarioManagerSummary(ctx.benchmarks, ctx.goal)}
        </div>
      </section>
  `;
}

function financePanelButton(id, label) {
  return `<button type="button" class="segmented-item ${STATE.panel === id ? 'active' : ''}" data-finance-action="select-panel" data-panel="${id}">${label}</button>`;
}

function assetOperationsCard(portfolio, market, tracks) {
  const updated = market.updatedAt
    ? new Date(market.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '시세 연결 전';
  return `
    <div class="asset-ops">
      <div class="asset-ops-summary">
        <div>
          <span>실제 총자산</span>
          <strong>${formatManwonFromKRW(portfolio.totalValue)}</strong>
        </div>
        <div>
          <span>운용자산</span>
          <strong>${formatManwonFromKRW(portfolio.operatingValue || 0)}</strong>
        </div>
        <div>
          <span>운용자산 수익률</span>
          <strong class="${(portfolio.operatingProfit || 0) >= 0 ? 'positive' : 'negative'}">${formatPct(portfolio.operatingReturnPct || 0)} · ${(portfolio.operatingProfit || 0) >= 0 ? '+' : ''}${formatManwonFromKRW(portfolio.operatingProfit || 0)}</strong>
        </div>
      </div>
      <div class="asset-ops-meta">${escHtml(updated)} · USD/KRW ${market.fx ? Math.round(market.fx).toLocaleString('ko-KR') : '-'} · ${escHtml(market.source || '시세 연결 대기')}</div>
      ${portfolioPolicyCard(portfolio)}
      <div class="asset-actions">
        <button type="button" class="tds-btn sm secondary" data-finance-action="refresh-market">시세 갱신</button>
        <label class="tds-btn sm secondary asset-import-button">
          사진으로 가져오기
          <input type="file" accept="image/*" data-finance-change="import-asset-image">
        </label>
        <button type="button" class="tds-btn sm" data-finance-action="new-asset-track">트랙 추가</button>
      </div>
      ${STATE.assetOpsOpen ? `
        ${assetImportStatus()}
        ${assetNewTrackEditor(tracks)}
      ` : ''}
      <div class="asset-track-list">
        ${portfolio.rows.length ? portfolio.rows.map(row => assetTrackRow(row)).join('') : '<div class="empty-state compact"><div>아직 자산 트랙이 없습니다</div></div>'}
      </div>
      ${assetTrackActionSheet(portfolio.rows)}
    </div>
  `;
}

function assetImportStatus() {
  const state = STATE.assetImport;
  if (!state) return '';
  if (state.status === 'loading') {
    return '<div class="asset-import-status"><div class="loading-spinner"></div><span>사진에서 자산 항목을 읽고 있습니다</span></div>';
  }
  if (state.status === 'done') {
    const added = state.added || 0;
    const skipped = state.skipped || 0;
    return `
      <div class="asset-import-status done">
        <strong>사진 반영 완료</strong>
        <span>${added}개 등록 · ${skipped}개 중복 제외</span>
      </div>
    `;
  }
  if (state.status === 'review') {
    const count = state.parsed?.positions?.length || 0;
    return `<div class="asset-import-status done"><strong>사진 분석 완료</strong><span>${count}개 항목의 저장 트랙을 선택해주세요</span></div>`;
  }
  if (state.status === 'error') {
    return `<div class="asset-import-status error"><strong>사진 분석 실패</strong><span>${escHtml(state.message || '다시 시도해주세요')}</span></div>`;
  }
  return '';
}

function assetImportReviewSheet(tracks) {
  const state = STATE.assetImport;
  if (state?.status !== 'review') return '';
  const positions = Array.isArray(state.parsed?.positions) ? state.parsed.positions : [];
  return `
    <div class="finance-sheet open" role="dialog" aria-modal="true">
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="finance-sheet-head">
          <div>
            <strong>사진에서 읽은 자산</strong>
            <span>저장할 트랙을 직접 골라주세요. 중복으로 보이는 항목은 저장 시 자동 제외합니다.</span>
          </div>
          <button type="button" data-finance-action="cancel-asset-import">닫기</button>
        </div>
        <form id="finance-asset-import-form" class="asset-import-review">
          ${positions.length ? positions.map((position, idx) => assetImportReviewRow(position, idx, tracks)).join('') : '<div class="empty-state compact"><div>읽어낸 항목이 없습니다</div></div>'}
          <button class="tds-btn full" type="submit" ${positions.length ? '' : 'disabled'}>선택한 트랙에 저장</button>
        </form>
      </div>
    </div>
  `;
}

function assetImportReviewRow(position, idx, tracks) {
  const suggested = pickTrackForPosition(position, tracks)?.id || tracks[0]?.id || '';
  const profit = Number(position.profitKRW);
  return `
    <div class="asset-import-row">
      <input type="hidden" name="positionIndex" value="${idx}">
      <div class="asset-import-row-main">
        <strong>${escHtml(position.name || position.symbol || '이름 없음')}</strong>
        <span>${formatManwonFromKRW(position.currentValueKRW || 0)}${Number.isFinite(profit) ? ` · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}` : ''}${Number.isFinite(Number(position.returnPct)) ? ` · ${formatPct(position.returnPct)}` : ''}</span>
        <em>${escHtml([position.broker, position.symbol, position.assetClass].filter(Boolean).join(' · '))}</em>
      </div>
      <label>
        <span>저장 트랙</span>
        <select name="trackId-${idx}">
          <option value="">저장 안 함</option>
          ${tracks.map(track => `<option value="${escHtml(track.id)}" ${track.id === suggested ? 'selected' : ''}>${escHtml(track.name || track.id)}</option>`).join('')}
        </select>
      </label>
    </div>
  `;
}

function assetNewTrackEditor(tracks) {
  if (STATE.editAssetTrackId !== '__new__') return '';
  const item = { order: tracks.length + 1 };
  return `
    <form id="finance-asset-track-form" class="finance-inline-form asset-editor">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-goal-grid">
        ${inputField('트랙명', 'name', item.name || '', '예: 올웨더 실험')}
        ${inputField('역할', 'role', item.role || '', '예: 연금 계좌 운용')}
        ${inputField('설명', 'desc', item.desc || '', '예: 미국국채/금/나스닥')}
        ${inputField('순서', 'order', item.order || tracks.length + 1)}
      </div>
      <button class="tds-btn full" type="submit">트랙 추가</button>
    </form>
  `;
}

function assetTrackRow(row) {
  const holdings = row.holdings || [];
  const profit = Number(row.profit) || 0;
  return `
    <div class="asset-track" data-asset-track-id="${escHtml(row.id)}">
      <div class="asset-track-head">
        <div class="asset-track-title">
          <strong>${escHtml(row.name)}</strong>
        </div>
        <div class="asset-track-value">
          <b>${row.currentValue ? formatManwonFromKRW(row.currentValue) : '금액 설정 필요'}</b>
          <em>${row.returnPct == null ? '-' : `${formatPct(row.returnPct)} · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}`}</em>
        </div>
        <button type="button" class="asset-track-menu-btn" data-finance-action="open-asset-track-menu" data-id="${escHtml(row.id)}" aria-label="${escHtml(row.name)} 설정">⚙</button>
      </div>
      ${holdings.length ? `
        <div class="asset-holding-list">
          ${holdings.map((item, idx) => holdingQuoteRow(row, item, idx)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function assetTrackActionSheet(rows = []) {
  const row = rows.find(item => item.id === STATE.assetTrackMenuId);
  if (!row) return '';
  const profit = Number(row.profit) || 0;
  const editingTrack = STATE.trackRenameId === row.id;
  const editingHolding = STATE.editHoldingTrackId === row.id;
  return `
    <div class="finance-sheet asset-track-action-sheet open" data-finance-action="close-asset-track-menu" data-finance-backdrop>
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="asset-track-action-head">
          <div>
            <strong>${escHtml(row.name)}</strong>
            <span>${row.returnPct == null ? '수익률 대기' : `${formatPct(row.returnPct)} · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}`}</span>
          </div>
          <b>${row.currentValue ? formatManwonFromKRW(row.currentValue) : '금액 설정 필요'}</b>
        </div>
        <div class="asset-track-action-grid">
          <button type="button" data-finance-action="edit-asset-track" data-id="${escHtml(row.id)}">트랙 수정</button>
          <button type="button" data-finance-action="new-holding" data-id="${escHtml(row.id)}">종목 추가</button>
          <button type="button" class="danger" data-finance-action="delete-asset-track" data-id="${escHtml(row.id)}">삭제</button>
        </div>
        ${editingTrack ? assetTrackRenameForm(row) : ''}
        ${editingHolding ? holdingEditor(row) : ''}
      </div>
    </div>
  `;
}

function assetTrackRenameForm(row) {
  return `
    <form id="finance-asset-track-rename-form" class="asset-rename-form">
      <input type="hidden" name="id" value="${escHtml(row.id)}">
      <input class="tds-input" name="name" value="${escHtml(row.name || '')}" placeholder="트랙명">
      <input class="tds-input" name="role" value="${escHtml(row.role || '')}" placeholder="역할">
      <input class="tds-input" name="desc" value="${escHtml(row.desc || '')}" placeholder="설명">
      <button type="submit">저장</button>
      <button type="button" data-finance-action="cancel-asset-track-edit">취소</button>
    </form>
  `;
}

function holdingEditor(track) {
  const item = Number.isInteger(STATE.editHoldingIndex) ? (track.holdings || [])[STATE.editHoldingIndex] || {} : {};
  return `
    <form id="finance-holding-form" class="finance-inline-form asset-editor compact">
      <input type="hidden" name="trackId" value="${escHtml(track.id)}">
      <input type="hidden" name="holdingIndex" value="${Number.isInteger(STATE.editHoldingIndex) ? STATE.editHoldingIndex : ''}">
      <div class="asset-symbol-search">
        <input class="tds-input" id="asset-symbol-query" placeholder="티커 검색: QQQ, 438100, 금 ETF" value="${escHtml(item.symbol || '')}">
        <button type="button" class="tds-btn sm secondary" data-finance-action="search-ticker">검색</button>
      </div>
      <div class="ticker-results" id="asset-ticker-results"></div>
      <div class="finance-goal-grid">
        ${inputField('티커', 'symbol', item.symbol || '', '예: QQQ 또는 438100.KS')}
        ${inputField('종목명', 'name', item.name || '', '예: Nasdaq ETF')}
        ${inputField('시장', 'market', item.market || 'KR', 'KR 또는 US')}
        ${inputField('수량', 'quantity', item.quantity || '')}
        ${inputField('매수가', 'avgPrice', item.avgPrice || '', 'USD 단가 / 원화 단가 / 총 매입금액')}
        ${inputField('매수일', 'purchaseDate', item.purchaseDate || '', '모르면 비워두기')}
        ${inputField('구매처', 'broker', item.broker || '', '예: 미래에셋, 토스증권')}
      </div>
      <button class="tds-btn full" type="submit">${Number.isInteger(STATE.editHoldingIndex) ? '종목 수정' : '종목 추가'}</button>
    </form>
  `;
}

function holdingQuoteRow(track, item, idx) {
  const returnPct = Number(item.returnPct);
  const dailyPct = Number(item.quote?.changePct);
  const lotMeta = [
    item.purchaseDate || '',
    item.broker || '',
    item.avgFx && item.currency === 'USD' ? `매수환율 ${Math.round(item.avgFx).toLocaleString('ko-KR')}원` : '',
    avgPriceModeLabel(item),
    item.quote?.price ? `현재가 ${formatQuotePrice(item.quote)}` : '',
    Number.isFinite(dailyPct) ? `전일 ${formatPct(dailyPct)}` : '',
    Number.isFinite(Number(item.portfolioWeight)) ? `비중 ${formatSharePct(item.portfolioWeight)}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="asset-holding" draggable="true" data-source-track-id="${escHtml(track.id)}" data-holding-index="${idx}">
      <span>${escHtml(item.name)} <small>${escHtml(item.symbol)}${lotMeta ? ` · ${escHtml(lotMeta)}` : ''}</small>${item.fxPnL ? `<small>환차익 ${formatManwonFromKRW(item.fxPnL)}</small>` : ''}</span>
      <strong>${item.currentValueKRW ? formatManwonFromKRW(item.currentValueKRW) : (item.quote?.price ? formatQuotePrice(item.quote) : '시세 대기')}</strong>
      <em>${Number.isFinite(returnPct) ? formatPct(returnPct) : '-'}</em>
      <button type="button" data-finance-action="edit-holding" data-id="${escHtml(track.id)}" data-index="${idx}">수정</button>
      <button type="button" class="danger" data-finance-action="delete-holding" data-id="${escHtml(track.id)}" data-index="${idx}">삭제</button>
    </div>
  `;
}

function avgPriceModeLabel(item) {
  if (item.avgPriceMode === 'BOND_PRICE_100') return '액면 100달러당 가격';
  if (item.avgPriceMode === 'TOTAL_KRW') return '총 매입금액 기준';
  if (item.avgPriceMode === 'KRW_UNIT' && item.currency === 'USD') return '원화 단가';
  if (item.avgPriceMode === 'USD_UNIT') return '달러 단가';
  return '';
}

function formatQuotePrice(quote) {
  const price = Number(quote.price) || 0;
  if (quote.currency === 'KRW') return `${Math.round(price).toLocaleString('ko-KR')}원`;
  if (quote.currency === 'USD') return `$${price.toFixed(2)}`;
  return price.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatPlainKRW(value) {
  return Math.round(Number(value) || 0).toLocaleString('ko-KR');
}

function latestActualText(actuals) {
  const latest = latestActualRecord(actuals);
  const value = Number(latest?.cumulativeSaved || latest?.netWorth || 0);
  return value ? formatManwonFromKRW(value) : '-';
}

function formatSharePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(1)}%`;
}
