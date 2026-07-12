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
  chartTooltipSvg,
  contributionForScenarioYear,
  firstScheduledContribution,
  normalizeContributionSchedule,
} from './projection/index.js';
import { contributionScheduleRow } from './editors/index.js';
import { bindFinanceEvents } from './events.js';
import { financeState as STATE } from './state.js';
import { $, escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';
import { fetchUsdKrwOnDate } from '../../utils/market-data.js';
import { searchLocalMarketSymbols } from '../../utils/market-symbol-catalog.js';
import { hasServerApi } from '../../utils/runtime.js';

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
    case 'delete-holding': financeDeleteHolding(id, index); break;
    case 'pick-ticker': financePickTicker(target.dataset.symbol, target.dataset.name, target.dataset.exchange); break;
    default: break;
  }
}

function bindFinanceForms() {
  bindContributionScheduleControls();
  bindScenarioForm();
  bindActualForm();
  bindFinanceChartInteractions();
  bindAssetTrackForm();
  bindAssetTrackRenameForm();
  bindHoldingForm();
  bindAssetImportForm();
  bindAssetHoldingDragDrop();
}

function bindFinanceChartInteractions() {
  document.querySelectorAll('.finance-chart svg').forEach(svg => {
    svg.addEventListener('mouseleave', () => hideFinancePointTooltip(svg));
    svg.addEventListener('blur', () => hideFinancePointTooltip(svg), true);
  });
  document.querySelectorAll('.finance-point-hit').forEach(dot => {
    const showLive = () => showFinancePointTooltip(dot);
    dot.addEventListener('mouseenter', showLive);
    dot.addEventListener('focus', showLive);
    dot.addEventListener('mouseleave', () => hideFinancePointTooltip(dot.closest('svg')));
    dot.addEventListener('pointerdown', showLive);
    dot.addEventListener('pointerup', () => hideFinancePointTooltip(dot.closest('svg')));
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 900);
    });
    dot.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 1200);
    });
  });
  document.querySelectorAll('[data-scenario-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-scenario-preview');
      STATE.compareScenarioId = STATE.compareScenarioId === id ? null : id;
      STATE.chartTooltip = null;
      renderFinance();
    });
  });
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

function hideFinancePointTooltip(svg) {
  const tip = svg?.querySelector('.finance-chart-tip-live');
  if (tip) tip.setAttribute('style', 'display:none');
  STATE.chartTooltip = null;
}

function showFinancePointTooltip(dot) {
  const svg = dot.closest('svg');
  const liveTip = svg?.querySelector('.finance-chart-tip-live');
  if (!svg || !liveTip) return;
  const tip = {
    year: Number(dot.dataset.year),
    balance: Number(dot.dataset.balance),
    profit: Number(dot.dataset.profit),
    x: Number(dot.dataset.x),
    y: Number(dot.dataset.y),
  };
  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 320, 184];
  const markup = chartTooltipSvg(tip, viewBox[2] || 320, viewBox[3] || 184, 'finance-chart-tip-live')
    .replace(/^\s*<g[^>]*>/, '')
    .replace(/<\/g>\s*$/i, '')
    .trim();
  liveTip.innerHTML = markup;
  liveTip.removeAttribute('style');
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
      const result = await mergeParsedAssetPositions(STATE.assetImport?.parsed || {}, assignments);
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

const financeToggleCashflow = () => {
  STATE.cashflowOpen = !STATE.cashflowOpen;
  renderFinance();
};

const financeToggleScenarioManager = () => {
  STATE.scenarioManagerOpen = !STATE.scenarioManagerOpen;
  renderFinance();
};

const financeToggleAssetOps = () => {
  STATE.assetOpsOpen = !STATE.assetOpsOpen;
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
    const items = await searchTicker(q);
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
    const dataUrl = await fileToDataUrl(file);
    const parsed = await parseAssetImage(dataUrl, file.type || 'image/jpeg');
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

async function parseAssetImage(dataUrl, mimeType) {
  if (!hasServerApi()) throw new Error('GitHub Pages에서는 사진 분석 API를 사용할 수 없습니다');
  const payload = { imageBase64: dataUrl, mimeType };
  const res = await postAssetImageParse('/api/asset-image-parse', payload);
  if (!res.ok) throw new Error(res.status === 404 || res.status === 501 ? '이미지 파싱 API에 연결할 수 없습니다' : `parse ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '사진 분석 실패');
  return data.parsed || {};
}

function postAssetImageParse(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function mergeParsedAssetPositions(parsed, assignments = {}) {
  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  let added = 0;
  let skipped = 0;
  const trackMap = new Map(STATE.assetTracks.map(track => [track.id, { ...track, holdings: [...(track.holdings || [])] }]));
  for (const [idx, position] of positions.entries()) {
    const assignedTrackId = assignments[String(idx)] || '';
    if (!assignedTrackId) {
      skipped += 1;
      continue;
    }
    const track = trackMap.get(assignedTrackId);
    if (!track) {
      skipped += 1;
      continue;
    }
    const holding = positionToHolding(position, parsed.asOf);
    if (isDuplicateHolding(track.holdings, holding)) {
      skipped += 1;
      continue;
    }
    track.holdings.push(holding);
    added += 1;
  }
  const changed = [...trackMap.values()].filter(track => {
    const original = STATE.assetTracks.find(item => item.id === track.id);
    return (original?.holdings || []).length !== track.holdings.length;
  });
  await Promise.all(changed.map(track => saveFinanceAssetTrack(track)));
  return { added, skipped };
}

function pickTrackForPosition(position, tracks) {
  const hint = String(position.trackHint || '').toLowerCase();
  const hay = `${position.name || ''} ${position.broker || ''} ${position.assetClass || ''}`.toLowerCase();
  const scored = tracks.map(track => {
    const text = `${track.id || ''} ${track.name || ''} ${track.role || ''} ${track.desc || ''}`.toLowerCase();
    let score = 0;
    if (hint && text.includes(hint)) score += 20;
    if (/irp|퇴직|연금|하나/.test(hay) && /irp|퇴직|연금/.test(text)) score += 30;
    if (/금|gold|국채|채권|bond|treasury/.test(hay) && /올웨더|분산|국채|금/.test(text)) score += 18;
    if (/tiger|ace|kodex|나스닥|주식|etf/.test(hay) && /주식|투자|적극|conviction|irp/.test(text)) score += 12;
    return { track, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].track : tracks.find(track => track.id !== 'deposit') || tracks[0] || null;
}

function positionToHolding(position, asOf) {
  const principal = Math.max(0, Math.round(Number(position.principalKRW) || Number(position.avgPrice) || 0));
  const currentValue = Math.max(0, Math.round(Number(position.currentValueKRW) || 0));
  const quantity = Math.max(0, Number(position.quantity ?? position.qty) || 0);
  const market = position.market === 'US' ? 'US' : 'KR';
  const currency = position.currency || (market === 'US' ? 'USD' : 'KRW');
  const avgPrice = quantity > 0 && principal > 0 ? Math.round(principal / quantity) : principal || currentValue;
  return {
    symbol: normalizeSymbol(String(position.symbol || '').trim().toUpperCase(), market),
    name: String(position.name || position.symbol || '').trim(),
    market,
    currency,
    quantity: quantity || 0,
    avgPrice,
    avgPriceMode: quantity > 0 ? 'KRW_UNIT' : 'TOTAL_KRW',
    principalKRW: principal || currentValue,
    currentValueKRW: currentValue,
    profitKRW: Math.round(Number(position.profitKRW) || (currentValue - principal) || 0),
    returnPct: Number.isFinite(Number(position.returnPct)) ? Number(position.returnPct) : null,
    broker: String(position.broker || '').trim(),
    assetClass: String(position.assetClass || '').trim(),
    source: 'asset-screenshot',
    snapshotAt: asOf || todayISO(),
  };
}

function isDuplicateHolding(holdings, candidate) {
  const key = holdingIdentity(candidate);
  return holdings.some(item => {
    if (holdingIdentity(item) !== key) return false;
    const valueA = Number(item.currentValueKRW) || Number(item.principalKRW) || Number(item.avgPrice) || 0;
    const valueB = Number(candidate.currentValueKRW) || Number(candidate.principalKRW) || Number(candidate.avgPrice) || 0;
    return nearMoney(valueA, valueB) || nearMoney(Number(item.principalKRW) || Number(item.avgPrice) || 0, Number(candidate.principalKRW) || 0);
  });
}

function holdingIdentity(item) {
  const symbol = String(item.symbol || '').toUpperCase().replace(/\s+/g, '');
  const name = normalizeAssetName(item.name || symbol);
  const broker = normalizeAssetName(item.broker || '');
  return `${symbol || name}|${broker}`;
}

function normalizeAssetName(value) {
  return String(value || '').toLowerCase().replace(/[\s._-]+/g, '');
}

function nearMoney(a, b) {
  if (!a || !b) return false;
  const diff = Math.abs(a - b);
  return diff <= Math.max(5000, Math.max(a, b) * 0.03);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

const financePickTicker = (symbol, name, exchange = '') => {
  const symbolInput = document.querySelector('#finance-holding-form [name=symbol]');
  const nameInput = document.querySelector('#finance-holding-form [name=name]');
  const marketInput = document.querySelector('#finance-holding-form [name=market]');
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (symbolInput) symbolInput.value = normalizedSymbol;
  if (nameInput) nameInput.value = String(name || '').trim() || normalizedSymbol;
  if (marketInput) marketInput.value = inferMarketFromTicker(normalizedSymbol, exchange);
};

function inferMarketFromTicker(symbol, exchange = '') {
  const exchangeText = String(exchange || '').toUpperCase();
  if (/(\.KS|\.KQ)$/.test(symbol) || /^\d{6}$/.test(symbol)) return 'KR';
  if (/(KSC|KOSPI|KOSDAQ|KRX|KOREA|SEOUL)/.test(exchangeText)) return 'KR';
  return 'US';
}

async function searchTicker(q) {
  const localItems = searchLocalMarketSymbols(q, 8);
  if (!hasServerApi()) return localItems;
  try {
    const res = await fetch(`/api/market-symbol-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = await res.json();
    return mergeSymbolItems(localItems, data.items || []).slice(0, 8);
  } catch {
    if (localItems.length) return localItems;
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
      const data = await proxyFetchJson(url);
      const yahooItems = (data.quotes || []).slice(0, 8).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange || '',
        type: item.quoteType || '',
      }));
      return mergeSymbolItems(yahooItems).slice(0, 8);
    } catch {
      return [];
    }
  }
}

function mergeSymbolItems(...groups) {
  const seen = new Set();
  return groups.flat().filter(item => {
    const key = String(item.symbol || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function proxyFetchJson(url) {
  const proxies = [
    value => `https://corsproxy.io/?${encodeURIComponent(value)}`,
    value => `https://api.allorigins.win/raw?url=${encodeURIComponent(value)}`,
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(url));
      if (res.ok) return await res.json();
    } catch {}
  }
  throw new Error('검색 프록시 실패');
}
