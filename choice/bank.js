import { escHtml } from '../utils/dom.js';
import { normalizeDate } from '../utils/mindbank.js?v=20260504-mockup-complete';

export function choiceBankCollections(entries = []) {
  const wineEntries = entries.filter(isWineBankEntry);
  const moneyEntries = entries.filter(entry => Number(entry.savedAmount) > 0);
  const kcalEntries = entries.filter(entry => Number(entry.savedKcal) > 0);
  return `
    <div class="choice-bank-collections">
      <article>
        <span>좋은 선택</span>
        <strong>${entries.length}건</strong>
        <small>넘김, 대체, 실현, 보류 연장이 한 기록으로 쌓입니다.</small>
      </article>
      <article>
        <span>와인셀러</span>
        <strong>${wineEntries.length}건</strong>
        <small>와인/술 관련 선택만 따로 보는 하위 컬렉션입니다.</small>
      </article>
      <article>
        <span>돈/열량</span>
        <strong>${moneyEntries.length + kcalEntries.length}건</strong>
        <small>금액과 kcal가 있는 기록을 감각 지표로 모읍니다.</small>
      </article>
    </div>
  `;
}

export function bankPatternPeakLabel(pattern = []) {
  const peak = pattern.reduce((best, row) => row.count > best.count ? row : best, { label: '', count: 0, pct: 0 });
  return peak.count ? '패턴 발견' : '기록 대기';
}

export function bankPatternInsight(pattern = []) {
  const peak = pattern.reduce((best, row) => row.count > best.count ? row : best, { label: '', count: 0, pct: 0 });
  if (!peak.count) {
    return `
      <div class="choice-bank-pattern-insight">
        <strong>아직 패턴을 찾는 중</strong>
        <span>좋은 선택과 욕구 기록이 쌓이면 자주 흔들리는 요일을 보여줍니다.</span>
      </div>
    `;
  }
  return `
    <div class="choice-bank-pattern-insight">
      <strong>${escHtml(peak.label)}에 충동이 가장 많아요</strong>
      <span>최근 기록에서 ${escHtml(peak.label)}에 ${peak.count}건이 몰렸어요. 그 시간대에 미리 대안을 하나 놓아두면 좋아요.</span>
    </div>
  `;
}

export function filterBankRowsByRange(rows = [], range = 'biweek') {
  if (range === 'all') return rows;
  const days = range === '30d' ? 30 : 14;
  return rows.filter(row => isWithinDays(normalizeDate(row.occurredAt) || normalizeDate(row.createdAt), days));
}

export function pactBreakWarning(pacts) {
  const closed = (pacts || []).filter(p => ['fulfilled', 'broken'].includes(p.status));
  const broken = closed.filter(p => p.status === 'broken');
  if (closed.length < 3 || broken.length / closed.length < 0.45) return '';
  return `
    <div class="insight warn pact-break-warning">
      <span class="tag">약속 조정</span>
      <div class="head">최근 약속이 자주 깨지고 있어요</div>
      <div class="body">새 약속은 비용을 낮추거나 날짜를 늦추고, 조건은 하나만 붙이는 편이 오래 갑니다. 깨짐은 실패가 아니라 다음 조건을 조정하는 데이터입니다.</div>
    </div>
  `;
}

function isWineBankEntry(entry = {}) {
  const text = [
    entry.choiceTitle,
    entry.urgeWhat,
    entry.category,
    ...(Array.isArray(entry.badges) ? entry.badges : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return /와인|술|wine|alcohol|drink/.test(text);
}

function isWithinDays(date, days) {
  if (!date) return false;
  return Date.now() - date.getTime() <= days * 86400000;
}
