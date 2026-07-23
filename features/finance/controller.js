import {
  saveFinanceGoal,
  saveFinanceBenchmark,
  deleteFinanceBenchmark,
  saveFinanceActual,
  deleteFinanceActual,
  saveFinanceAssetTrack,
  deleteFinanceAssetTrack,
} from '../../data.js';
import {
  contributionForScenarioYear,
  firstScheduledContribution,
  normalizeContributionSchedule,
} from './projection/index.js';
import { bindFinanceChartInteractions } from './chart/controller.js';
import { contributionScheduleRow } from './editors/index.js';
import { bindFinanceEvents } from './events.js';
import { financeState as STATE } from './state.js';
import { $, escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';
import { compoundProjection } from '../../utils/finance-goals.js';
import { fetchUsdKrwOnDate } from '../../utils/market-data.js';
import {
  inferMarketFromTicker as inferMarketFromTickerService,
  mergeParsedAssetPositions as mergeParsedAssetPositionsService,
  parseAssetImage as parseAssetImageService,
  readFileAsDataUrl,
  searchTickerSymbols,
} from './assets/service.js';

let renderFinance = async () => {};

export function bindFinanceController(root, renderer) {
  renderFinance = renderer;
  bindFinanceEvents(root, handleFinanceAction);
  bindFinanceForms();
}

function handleFinanceAction(action, target) {
  const id = target.dataset.id || '';
  const index = Number(target.dataset.index);
  switch (action) {
    case 'toggle-scenario-manager': financeToggleScenarioManager(); break;
    case 'open-actual-sheet': financeOpenActualSheet(); break;
    case 'select-panel': financeSelectPanel(target.dataset.panel); break;
    case 'refresh-market': financeRefreshMarket(); break;
    case 'import-asset-image': financeImportAssetImage(target); break;
    case 'new-asset-track': financeNewAssetTrack(); break;
    case 'set-target-scenario': financeSetTargetScenario(id); break;
    case 'edit': financeEdit(target.dataset.type, id); break;
    case 'delete': financeDelete(target.dataset.type, id); break;
    case 'new-scenario': financeNewScenario(); break;
    case 'close-scenario-editor': financeCloseScenarioEditor(); break;
    case 'new-actual': financeNewActual(); break;
    case 'toggle-actual-year': financeToggleActualYear(id); break;
    case 'edit-actual': financeEditActual(id); break;
    case 'cancel-actual-edit': financeCancelActualEdit(); break;
    case 'close-actual-sheet': financeCloseActualSheet(); break;
    case 'cancel-asset-import': financeCancelAssetImport(); break;
    case 'open-asset-track-menu': financeOpenAssetTrackMenu(id); break;
    case 'close-asset-track-menu': financeCloseAssetTrackMenu(); break;
    case 'edit-asset-track': financeEditAssetTrack(id); break;
    case 'new-holding': financeNewHolding(id); break;
    case 'delete-asset-track': financeDeleteAssetTrack(id); break;
    case 'cancel-asset-track-edit': financeCancelAssetTrackEdit(); break;
    case 'search-ticker': financeSearchTicker(); break;
    case 'edit-holding': financeEditHolding(id, index); break;
    case 'move-holding': financeStartMoveHolding(id, index); break;
    case 'move-holding-to': financeMoveHoldingTo(target.dataset.sourceTrackId, index, id); break;
    case 'cancel-move-holding': financeCancelMoveHolding(); break;
    case 'delete-holding': financeDeleteHolding(id, index); break;
    case 'pick-ticker': financePickTicker(target.dataset.symbol, target.dataset.name, target.dataset.exchange); break;
    default: break;
  }
}

function bindFinanceForms() {
  bindContributionScheduleControls();
  bindScenarioForm();
  bindActualForm();
  bindFinanceChartInteractions(renderFinance);
  bindAssetTrackForm();
  bindAssetTrackRenameForm();
  bindHoldingForm();
  bindAssetImportForm();
  bindAssetHoldingDragDrop();
}

function bindContributionScheduleControls() {
  const rows = $('#finance-contribution-rows');
  const addButton = document.querySelector('[data-add-contribution-row]');
  if (addButton && rows) {
    addButton.addEventListener('click', () => {
      const lastStart = [...rows.querySelectorAll('input[name="scheduleStartYear"]')]
        .map(input => Number(input.value))
        .filter(Boolean)
        .at(-1);
      rows.insertAdjacentHTML('beforeend', contributionScheduleRow({
        startYear: lastStart ? lastStart + 1 : new Date().getFullYear(),
        endYear: '',
        annualContribution: '',
      }));
    });
  }
  rows?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-contribution-row]');
    if (!btn) return;
    const row = btn.closest('.finance-contribution-row');
    if (!row) return;
    if (rows.querySelectorAll('.finance-contribution-row').length <= 1) {
      row.querySelectorAll('input').forEach(input => { input.value = ''; });
      return;
    }
    row.remove();
  });
}

function bindAssetTrackRenameForm() {
  $('#finance-asset-track-rename-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existing = STATE.assetTracks.find(track => track.id === text(fd, 'id'));
    if (!existing) return;
    STATE.trackRenameId = null;
    await runSave(() => saveFinanceAssetTrack({
      ...existing,
      name: text(fd, 'name') || existing.name,
      role: text(fd, 'role'),
      desc: text(fd, 'desc'),
    }), '트랙명 저장됨');
  });
}

function bindAssetImportForm() {
  $('#finance-asset-import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assignments = {};
    for (const [key, value] of fd.entries()) {
      if (key.startsWith('trackId-')) assignments[key.replace('trackId-', '')] = String(value || '');
    }
    await runSave(async () => {
      const result = await mergeParsedAssetPositionsService(
        STATE.assetImport?.parsed || {},
        assignments,
        STATE.assetTracks,
        saveFinanceAssetTrack,
      );
      STATE.assetImport = { status: 'done', ...result };
    }, '사진 자산을 저장했습니다');
  });
}

function bindAssetHoldingDragDrop() {
  document.querySelectorAll('.asset-holding[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      const payload = {
        sourceTrackId: row.dataset.sourceTrackId || '',
        holdingIndex: Number(row.dataset.holdingIndex),
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', `${payload.sourceTrackId}:${payload.holdingIndex}`);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.asset-track.drop-target').forEach(track => track.classList.remove('drop-target'));
    });
  });

  document.querySelectorAll('.asset-track[data-asset-track-id]').forEach(trackEl => {
    trackEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trackEl.classList.add('drop-target');
    });
    trackEl.addEventListener('dragleave', (e) => {
      if (!trackEl.contains(e.relatedTarget)) trackEl.classList.remove('drop-target');
    });
    trackEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      trackEl.classList.remove('drop-target');
      const payload = parseHoldingDragPayload(e.dataTransfer);
      const targetTrackId = trackEl.dataset.assetTrackId || '';
      if (!payload || !targetTrackId) return;
      await moveHoldingToTrack(payload.sourceTrackId, payload.holdingIndex, targetTrackId);
    });
  });
}

function parseHoldingDragPayload(dataTransfer) {
  try {
    const raw = dataTransfer.getData('application/json');
    if (raw) {
      const data = JSON.parse(raw);
      return {
        sourceTrackId: String(data.sourceTrackId || ''),
        holdingIndex: Number(data.holdingIndex),
      };
    }
  } catch {}
  const [sourceTrackId, index] = String(dataTransfer.getData('text/plain') || '').split(':');
  return { sourceTrackId, holdingIndex: Number(index) };
}

function financeStartMoveHolding(trackId, holdingIndex) {
  STATE.moveHoldingTrackId = trackId;
  STATE.moveHoldingIndex = Number.isInteger(holdingIndex) ? holdingIndex : null;
  renderFinance();
}

function financeCancelMoveHolding() {
  STATE.moveHoldingTrackId = null;
  STATE.moveHoldingIndex = null;
  renderFinance();
}

async function financeMoveHoldingTo(sourceTrackId, holdingIndex, targetTrackId) {
  STATE.moveHoldingTrackId = null;
  STATE.moveHoldingIndex = null;
  await moveHoldingToTrack(sourceTrackId, holdingIndex, targetTrackId);
}

async function moveHoldingToTrack(sourceTrackId, holdingIndex, targetTrackId) {
  if (!sourceTrackId || sourceTrackId === targetTrackId || !Number.isInteger(holdingIndex)) return;
  const sourceTrack = STATE.assetTracks.find(item => item.id === sourceTrackId);
  const targetTrack = STATE.assetTracks.find(item => item.id === targetTrackId);
  const sourceHoldings = [...(sourceTrack?.holdings || [])];
  const targetHoldings = [...(targetTrack?.holdings || [])];
  const [holding] = sourceHoldings.splice(holdingIndex, 1);
  if (!sourceTrack || !targetTrack || !holding) return;
  targetHoldings.push(holding);
  await runSave(async () => {
    await saveFinanceAssetTrack({ ...sourceTrack, holdings: sourceHoldings });
    await saveFinanceAssetTrack({ ...targetTrack, holdings: targetHoldings });
  }, '종목을 다른 트랙으로 이동했습니다');
}

function bindScenarioForm() {
  $('#finance-scenario-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const contributionSchedule = scheduleFromFormData(fd);
    const fallbackAnnualContribution = manwonToKRWInput(fd.get('annualContribution'));
    await runSave(async () => {
      await saveFinanceBenchmark({
      id: text(fd, 'id') || null,
      name: text(fd, 'name') || '시뮬레이션',
      startYear: num(fd, 'startYear'),
      periodYears: num(fd, 'periodYears'),
      annualRate: decimal(fd, 'annualRate'),
      inflationRate: decimal(fd, 'inflationRate'),
      initialPrincipal: manwonToKRWInput(fd.get('initialPrincipal')),
      annualContribution: contributionSchedule[0]?.annualContribution || fallbackAnnualContribution,
      contributionTiming: contributionSchedule.length ? 'yearEnd' : 'monthly',
      contributionSchedule,
      });
      STATE.editScenarioId = null;
    }, '시나리오 저장됨');
  });
}

function bindActualForm() {
  $('#finance-actual-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await runSave(() => saveFinanceActual({
      id: text(fd, 'id') || null,
      year: num(fd, 'year'),
      cumulativeSaved: manwonToKRWInput(fd.get('cumulativeSaved')),
      netWorth: manwonToKRWInput(fd.get('netWorth')),
      emergencyFund: manwonToKRWInput(fd.get('emergencyFund')),
      monthlyExpense: manwonToKRWInput(fd.get('monthlyExpense')),
      inflow: manwonToKRWInput(fd.get('inflow')),
      fixedOutflow: manwonToKRWInput(fd.get('fixedOutflow')),
    }), '실적 저장됨');
    STATE.editActualId = null;
  });
}

function bindAssetTrackForm() {
  $('#finance-asset-track-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existing = STATE.assetTracks.find(track => track.id === text(fd, 'id')) || {};
    STATE.editAssetTrackId = null;
    await runSave(() => saveFinanceAssetTrack({
      ...existing,
      id: text(fd, 'id') || null,
      name: text(fd, 'name') || '자산 트랙',
      role: text(fd, 'role'),
      desc: text(fd, 'desc'),
      order: num(fd, 'order'),
      holdings: existing.holdings || [],
    }), '자산 트랙 저장됨');
  });
}

function bindHoldingForm() {
  $('#finance-holding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const trackId = text(fd, 'trackId');
    const track = STATE.assetTracks.find(item => item.id === trackId);
    if (!track) {
      showToast('트랙을 찾을 수 없습니다', 1800, 'error');
      return;
    }
    const idxRaw = text(fd, 'holdingIndex');
    const idx = idxRaw === '' ? -1 : Number(idxRaw);
    const holdings = [...(track.holdings || [])];
    const market = text(fd, 'market').toUpperCase() === 'US' ? 'US' : 'KR';
    const symbol = normalizeSymbol(text(fd, 'symbol'), market);
    if (!symbol) {
      showToast('티커를 입력해주세요', 1600, 'warning');
      return;
    }
    const purchaseDate = normalizeDateInput(text(fd, 'purchaseDate'));
    const avgFx = market === 'US' ? await resolvePurchaseFx(purchaseDate) : 1;
    const holding = {
      symbol,
      name: text(fd, 'name') || symbol,
      market,
      currency: market === 'US' ? 'USD' : 'KRW',
      quantity: decimal(fd, 'quantity'),
      avgPrice: decimal(fd, 'avgPrice'),
      avgPriceMode: isTreasuryBondSymbol(symbol) ? 'BOND_PRICE_100' : '',
      assetClass: isTreasuryBondSymbol(symbol) ? 'bond' : '',
      avgFx,
      purchaseDate,
      broker: text(fd, 'broker'),
    };
    if (idx >= 0) holdings[idx] = holding;
    else holdings.push(holding);
    STATE.editHoldingTrackId = null;
    STATE.editHoldingIndex = null;
    await runSave(() => saveFinanceAssetTrack({ ...track, holdings }), '종목 저장됨');
  });
}

async function runSave(fn, message) {
  try {
    await fn();
    showToast(message, 1400, 'success');
    await renderFinance();
  } catch (err) {
    showToast(err.message, 2600, 'error');
  }
}

function manwonToKRWInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0) * 10000);
}

function scheduleFromFormData(fd) {
  const starts = fd.getAll('scheduleStartYear');
  const ends = fd.getAll('scheduleEndYear');
  const amounts = fd.getAll('scheduleContribution');
  return starts.map((start, idx) => {
    const startYear = Math.round(Number(String(start || '').replace(/[^\d.-]/g, '')) || 0);
    const endYearRaw = Math.round(Number(String(ends[idx] || '').replace(/[^\d.-]/g, '')) || 0);
    const annualContribution = manwonToKRWInput(amounts[idx]);
    return {
      startYear,
      endYear: endYearRaw || null,
      annualContribution,
    };
  }).filter(entry => entry.startYear && entry.annualContribution)
    .sort((a, b) => a.startYear - b.startYear);
}

function num(fd, key) {
  return Math.round(Number(String(fd.get(key) || '').replace(/[^\d.-]/g, '')) || 0);
}

function decimal(fd, key) {
  return Number(String(fd.get(key) || '').replace(/[^\d.-]/g, '')) || 0;
}

function text(fd, key) {
  return String(fd.get(key) || '').trim();
}

function normalizeSymbol(symbol, market = 'KR') {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('.')) return raw;
  const compactKr = raw.match(/^(\d{6})(KS|KQ)$/);
  if (compactKr) return `${compactKr[1]}.${compactKr[2]}`;
  if (market === 'KR' && /^\d{6}$/.test(raw)) return `${raw}.KS`;
  return raw;
}

function isTreasuryBondSymbol(symbol) {
  return /^UST-\d{4}-\d{2}-\d{2}$/i.test(String(symbol || '').trim());
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

async function resolvePurchaseFx(purchaseDate) {
  if (!purchaseDate) return 0;
  try {
    const fx = await fetchUsdKrwOnDate(purchaseDate);
    if (Number(fx) > 0) return Number(fx);
  } catch (err) {
    console.warn('[finance] purchase fx fallback', err);
  }
  return 0;
}

const financeEdit = (type, id) => {
  if (type === 'scenario') {
    STATE.editScenarioId = id;
    STATE.scenarioManagerOpen = true;
  }
  if (type === 'actual') {
    STATE.editActualId = id;
    STATE.expandedActualId = id;
    STATE.actualSheetOpen = true;
  }
  renderFinance();
};

const financeNewScenario = () => {
  STATE.editScenarioId = '__new__';
  STATE.scenarioManagerOpen = true;
  renderFinance();
};

const financeCloseScenarioEditor = () => {
  STATE.editScenarioId = null;
  renderFinance();
};

const financeDelete = async (type, id) => {
  if (!confirm('삭제할까요?')) return;
  const action = type === 'scenario' ? deleteFinanceBenchmark : deleteFinanceActual;
  await runSave(async () => {
    await action(id);
    if (type === 'actual') {
      if (STATE.editActualId === id) STATE.editActualId = null;
      if (STATE.expandedActualId === id) STATE.expandedActualId = null;
    }
    if (type === 'scenario' && STATE.targetScenarioId === id) {
      await saveFinanceGoal({
        id: STATE.activeGoalId || null,
        name: STATE.activeGoalName || '목표 시나리오',
        targetYear: new Date().getFullYear(),
        startAmount: 0,
        targetAmount: 0,
        monthlyContributionTarget: 0,
        annualRate: 0,
        inflationRate: 0,
        heroBasisType: 'scenario',
        heroBenchmarkId: null,
      });
    }
  }, '삭제됨');
};

const financeSetTargetScenario = async (id) => {
  const scenario = STATE.scenarios.find(item => item.id === id);
  if (!scenario) {
    showToast('시나리오를 찾을 수 없습니다', 1800, 'error');
    return;
  }
  const startYear = Number(scenario.startYear) || new Date().getFullYear();
  const periodYears = Math.max(1, Number(scenario.periodYears) || 1);
  const contributionSchedule = normalizeContributionSchedule(scenario.contributionSchedule);
  const annualContribution = Number(scenario.annualContribution) || firstScheduledContribution(contributionSchedule) || 0;
  const contributionTiming = contributionSchedule.length ? 'yearEnd' : (scenario.contributionTiming || 'monthly');
  const rows = compoundProjection({
    startAmount: Number(scenario.initialPrincipal) || 0,
    monthlyContribution: contributionTiming === 'yearEnd' ? 0 : Math.round(annualContribution / 12),
    annualContribution,
    contributionSchedule,
    contributionTiming,
    annualRate: Number(scenario.annualRate) || 0,
    startYear,
    targetYear: startYear + periodYears - 1,
  });
  const last = rows.at(-1) || {};
  await runSave(() => saveFinanceGoal({
    id: STATE.activeGoalId || null,
    name: scenario.name || STATE.activeGoalName || '목표 시나리오',
    targetYear: last.year || startYear + periodYears - 1,
    startAmount: Number(scenario.initialPrincipal) || 0,
    targetAmount: Number(last.balance) || 0,
    monthlyContributionTarget: Math.round(contributionForScenarioYear({ annualContribution, contributionSchedule, contributionTiming }, new Date().getFullYear()) / 12),
    annualRate: Number(scenario.annualRate) || 0,
    inflationRate: Number(scenario.inflationRate) || 0,
    heroBasisType: 'scenario',
    heroBenchmarkId: id,
  }), '목표 시나리오로 설정됨');
};

const financeOpenActualSheet = () => {
  STATE.actualSheetOpen = true;
  STATE.expandedActualId = null;
  STATE.editActualId = null;
  renderFinance();
};

const financeRefreshMarket = () => {
  localStorage.removeItem('budget_market_quotes_v1');
  localStorage.removeItem('budget_market_quotes_time_v1');
  showToast('시세를 다시 불러옵니다', 1200, 'success');
  return renderFinance();
};

const financeNewActual = () => {
  STATE.editActualId = '__new__';
  STATE.expandedActualId = null;
  STATE.actualSheetOpen = true;
  renderFinance();
};

const financeCloseActualSheet = () => {
  STATE.actualSheetOpen = false;
  STATE.editActualId = null;
  STATE.expandedActualId = null;
  renderFinance();
};

const financeToggleActualYear = (id) => {
  STATE.actualSheetOpen = true;
  const wasEditing = !!STATE.editActualId;
  STATE.editActualId = null;
  STATE.expandedActualId = STATE.expandedActualId === id ? null : id;
  if (wasEditing) {
    renderFinance();
    return;
  }
  const sheet = document.getElementById('finance-actual-sheet');
  const cards = sheet ? Array.from(sheet.querySelectorAll('.finance-actual-year')) : [];
  if (!cards.length) {
    renderFinance();
    return;
  }
  for (const card of cards) {
    const isOpen = card.dataset.actualId === STATE.expandedActualId;
    card.classList.toggle('open', isOpen);
    card.querySelector('.finance-actual-year-head')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
};

const financeEditActual = (id) => {
  STATE.actualSheetOpen = true;
  STATE.expandedActualId = id;
  STATE.editActualId = id;
  renderFinance();
};

const financeCancelActualEdit = () => {
  STATE.editActualId = null;
  renderFinance();
};

const financeToggleScenarioManager = () => {
  STATE.scenarioManagerOpen = !STATE.scenarioManagerOpen;
  renderFinance();
};

const financeSelectPanel = (panel) => {
  STATE.panel = ['scenario', 'asset'].includes(panel) ? panel : 'scenario';
  renderFinance();
};

const financeNewAssetTrack = () => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = '__new__';
  STATE.assetTrackMenuId = null;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

const financeOpenAssetTrackMenu = (id) => {
  STATE.assetTrackMenuId = id;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

const financeCloseAssetTrackMenu = () => {
  STATE.assetTrackMenuId = null;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

const financeEditAssetTrack = (id) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = id;
  STATE.trackRenameId = id;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

const financeCancelAssetTrackEdit = () => {
  STATE.trackRenameId = null;
  renderFinance();
};

const financeDeleteAssetTrack = async (id) => {
  if (!confirm('이 자산 트랙을 삭제할까요?')) return;
  if (STATE.assetTrackMenuId === id) STATE.assetTrackMenuId = null;
  if (STATE.trackRenameId === id) STATE.trackRenameId = null;
  if (STATE.editHoldingTrackId === id) STATE.editHoldingTrackId = null;
  await runSave(() => deleteFinanceAssetTrack(id), '자산 트랙 삭제됨');
};

const financeNewHolding = (trackId) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = trackId;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = trackId;
  STATE.editHoldingIndex = null;
  renderFinance();
};

const financeEditHolding = (trackId, index) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = trackId;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = trackId;
  STATE.editHoldingIndex = index;
  renderFinance();
};

const financeDeleteHolding = async (trackId, index) => {
  if (!confirm('이 종목을 삭제할까요?')) return;
  const track = STATE.assetTracks.find(item => item.id === trackId);
  if (!track) return;
  const holdings = [...(track.holdings || [])];
  holdings.splice(index, 1);
  await runSave(() => saveFinanceAssetTrack({ ...track, holdings }), '종목 삭제됨');
};

const financeSearchTicker = async () => {
  const input = $('#asset-symbol-query');
  const box = $('#asset-ticker-results');
  const q = input?.value?.trim();
  if (!q || !box) return;
  box.innerHTML = '<div class="ticker-result muted">검색 중...</div>';
  try {
    const items = await searchTickerSymbols(q);
    box.innerHTML = items.length
      ? items.map(item => `
        <button
          type="button"
          class="ticker-result"
          data-finance-action="pick-ticker"
          data-symbol="${escHtml(item.symbol || '')}"
          data-name="${escHtml(item.name || '')}"
          data-exchange="${escHtml(item.exchange || item.type || '')}"
        >
          <strong>${escHtml(item.symbol)}</strong>
          <span>${escHtml(item.name)} · ${escHtml(item.exchange || item.type || '')}</span>
        </button>
      `).join('')
      : '<div class="ticker-result muted">검색 결과가 없습니다. Yahoo 티커를 직접 입력해도 됩니다.</div>';
  } catch (err) {
    box.innerHTML = `<div class="ticker-result muted">검색 실패: ${escHtml(err.message)}</div>`;
  }
};

const financeImportAssetImage = async (input) => {
  const file = input?.files?.[0];
  if (!file) return;
  STATE.assetOpsOpen = true;
  STATE.assetImport = { status: 'loading' };
  renderFinance();
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const parsed = await parseAssetImageService(dataUrl, file.type || 'image/jpeg');
    STATE.assetImport = { status: 'review', parsed };
    showToast('사진을 읽었습니다. 저장할 트랙을 골라주세요', 2200, 'success');
    await renderFinance();
  } catch (err) {
    STATE.assetImport = { status: 'error', message: err.message };
    showToast('사진 분석에 실패했습니다', 1800, 'error');
    renderFinance();
  } finally {
    if (input) input.value = '';
  }
};

const financeCancelAssetImport = () => {
  STATE.assetImport = null;
  renderFinance();
};

const financePickTicker = (symbol, name, exchange = '') => {
  const symbolInput = document.querySelector('#finance-holding-form [name=symbol]');
  const nameInput = document.querySelector('#finance-holding-form [name=name]');
  const marketInput = document.querySelector('#finance-holding-form [name=market]');
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (symbolInput) symbolInput.value = normalizedSymbol;
  if (nameInput) nameInput.value = String(name || '').trim() || normalizedSymbol;
  if (marketInput) marketInput.value = inferMarketFromTickerService(normalizedSymbol, exchange);
};
