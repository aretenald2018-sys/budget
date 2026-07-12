import { formatManwonFromKRW } from '../../../utils/finance-goals.js';
import { escHtml } from '../../../utils/dom.js';

const TARGET_PORTFOLIO = [
  { id: 'nasdaq', name: '나스닥100', target: 0.70, short: 'QQQM', buy: 'QQQM / KODEX 미국나스닥100TR' },
  { id: 'dividend', name: '배당성장', target: 0.10, short: 'SCHD', buy: 'SCHD / 미국배당다우존스 ETF' },
  { id: 'gold', name: '금', target: 0.15, short: 'IAU', buy: 'IAU / GLD / KRX 금' },
  { id: 'individual', name: '개별주', target: 0.05, short: 'M7', buy: 'M7 개별주 슬롯' },
];
const TARGET_BUCKET_IDS = new Set(TARGET_PORTFOLIO.map(item => item.id));

export function portfolioPolicyCard(portfolio) {
  const alignment = portfolioAlignment(portfolio);
  if (!alignment.total) {
    return `
      <div class="portfolio-policy-card empty">
        <div class="portfolio-policy-head">
          <div>
            <strong>70/10/15/5 점검</strong>
            <span>운용자산이 입력되면 목표 포트폴리오와의 차이를 계산합니다.</span>
          </div>
        </div>
      </div>
    `;
  }
  const status = alignment.driftPct <= 5 ? '좋음' : alignment.driftPct <= 15 ? '조정 필요' : '크게 이탈';
  return `
    <div class="portfolio-policy-card">
      <div class="portfolio-policy-head">
        <div>
          <strong>70/10/15/5 포트폴리오 점검</strong>
          <span>전세금·보증금 제외 운용자산 기준 · ${alignment.sourceNote}</span>
        </div>
        <em class="${alignment.driftPct <= 5 ? 'positive' : alignment.driftPct <= 15 ? 'warning' : 'negative'}">${status}</em>
      </div>
      <div class="portfolio-policy-total">
        <span>운용자산 ${formatManwonFromKRW(alignment.total)}</span>
        <b>총 이탈 ${formatManwonFromKRW(alignment.driftAmount)} · ${formatSharePct(alignment.driftPct)}</b>
      </div>
      <div class="portfolio-bucket-list">
        ${alignment.buckets.map(bucket => portfolioBucketRow(bucket, alignment.moves)).join('')}
      </div>
      <div class="portfolio-move-box">
        <div class="portfolio-move-title">추천 이동</div>
        ${alignment.moves.length ? alignment.moves.map(move => `
          <div class="portfolio-move-row">
            <span title="${escHtml(move.from)}">${escHtml(compactPortfolioMoveName(move.from))}</span>
            <b>${formatManwonFromKRW(move.amount)}</b>
            <em title="${escHtml(move.to)}">→ ${escHtml(compactPortfolioMoveName(move.to))}</em>
          </div>
        `).join('') : '<div class="portfolio-move-empty">현재 비중은 목표 범위에 가깝습니다. 신규 불입금만 부족 버킷에 넣으면 됩니다.</div>'}
      </div>
    </div>
  `;
}

export function portfolioBucketRow(bucket, moves = []) {
  const actual = formatSharePct(bucket.actualPct);
  const target = bucket.targetPct ? formatSharePct(bucket.targetPct) : '0.0%';
  const diff = bucket.diff;
  const diffClass = Math.abs(bucket.diffPct) < 0.5 ? '' : diff > 0 ? 'over' : 'under';
  const actualWidth = Math.min(100, Math.max(0, bucket.actualPct));
  const targetWidth = Math.min(100, Math.max(0, bucket.targetPct || 0));
  const actualClamped = Math.min(100, Math.max(0, actualWidth));
  const gapLeft = Math.min(actualWidth, targetWidth);
  const gapWidth = diffClass === 'under' ? Math.max(0, targetWidth - actualWidth) : 0;
  const moveText = portfolioBucketMoveText(bucket, moves);
  return `
    <div class="portfolio-bucket-row ${diffClass}">
      <div class="portfolio-bucket-main">
        <span><b>${escHtml(bucket.name)}</b><small>현재 ${actual} · 목표 ${target}</small></span>
        <strong>${formatManwonFromKRW(bucket.amount)}</strong>
      </div>
      <div class="portfolio-bucket-bar">
        <i class="actual" style="width:${actualClamped.toFixed(1)}%"></i>
        ${gapWidth > 0 ? `<i class="target-range" style="left:${gapLeft.toFixed(1)}%;width:${gapWidth.toFixed(1)}%"></i>` : ''}
        ${targetWidth > 0 ? `<i class="target-marker" style="left:${targetWidth.toFixed(1)}%"></i>` : ''}
      </div>
      <div class="portfolio-bucket-diff ${diffClass}">
        ${moveText}
      </div>
    </div>
  `;
}

export function portfolioBucketMoveText(bucket, moves) {
  if (Math.abs(bucket.diff) < 10000) {
    return '<span>상태</span><strong>목표 근접</strong><em>조정 없음</em>';
  }
  const incoming = moves
    .filter(move => move.toBucketId === bucket.id)
    .reduce((sum, move) => sum + (Number(move.amount) || 0), 0);
  const outgoing = moves
    .filter(move => move.fromBucketId === bucket.id)
    .reduce((sum, move) => sum + (Number(move.amount) || 0), 0);
  if (bucket.diff < 0) {
    const amount = incoming || Math.abs(bucket.diff);
    return `<span>부족</span><strong>${formatManwonFromKRW(amount)} 추가</strong><em>목표까지 ${formatManwonFromKRW(Math.abs(bucket.diff))}</em>`;
  }
  const amount = outgoing || bucket.diff;
  return `<span>초과</span><strong>${formatManwonFromKRW(amount)} 이동</strong><em>초과 ${formatManwonFromKRW(bucket.diff)}</em>`;
}

export function portfolioAlignment(portfolio) {
  const items = flattenPortfolioItems(portfolio);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const targetById = Object.fromEntries(TARGET_PORTFOLIO.map(item => [item.id, item]));
  const bucketMap = {};
  for (const target of TARGET_PORTFOLIO) {
    bucketMap[target.id] = { ...target, amount: 0, items: [] };
  }
  bucketMap.other = { id: 'other', name: '기타/미분류', target: 0, short: '기타', buy: '목표 버킷 재분류', amount: 0, items: [] };

  for (const item of items) {
    const bucketId = TARGET_BUCKET_IDS.has(item.bucketId) ? item.bucketId : 'other';
    bucketMap[bucketId].amount += item.amount;
    bucketMap[bucketId].items.push(item);
  }

  const buckets = [...TARGET_PORTFOLIO.map(target => bucketMap[target.id]), bucketMap.other]
    .map(bucket => {
      const targetAmount = Math.round(total * (Number(bucket.target) || 0));
      const targetPct = (Number(bucket.target) || 0) * 100;
      const actualPct = total ? bucket.amount / total * 100 : 0;
      return {
        ...bucket,
        targetAmount,
        targetPct,
        actualPct,
        diff: bucket.amount - targetAmount,
        diffPct: actualPct - targetPct,
      };
    });
  const driftAmount = buckets.reduce((sum, bucket) => sum + Math.abs(bucket.diff), 0) / 2;
  const moves = rebalanceMoves(buckets, targetById);
  const allocatedByWeight = items.some(item => item.allocatedByWeight);
  return {
    total,
    buckets,
    moves,
    driftAmount: Math.round(driftAmount),
    driftPct: total ? driftAmount / total * 100 : 0,
    sourceNote: allocatedByWeight ? '평가액 없는 종목은 입력 비중으로 배분' : '실시간/입력 평가액 기준',
  };
}

export function flattenPortfolioItems(portfolio) {
  const items = [];
  for (const row of portfolio?.rows || []) {
    if (!isOperatingAssetRow(row)) continue;
    const holdings = row.holdings || [];
    const valuedHoldings = holdings.filter(item => Number(item.currentValueKRW) > 0);
    if (valuedHoldings.length) {
      for (const holding of valuedHoldings) addPolicyItem(items, row, holding, Number(holding.currentValueKRW) || 0, false);
      continue;
    }
    const weightedHoldings = holdings.filter(item => Number(item.weight) > 0);
    if (weightedHoldings.length && Number(row.currentValue) > 0) {
      const weightSum = weightedHoldings.reduce((sum, item) => sum + Number(item.weight || 0), 0) || weightedHoldings.length;
      for (const holding of weightedHoldings) {
        const share = Number(holding.weight || 0) || 1 / weightedHoldings.length;
        addPolicyItem(items, row, holding, Math.round(Number(row.currentValue) * share / weightSum), true);
      }
      continue;
    }
    if (Number(row.currentValue) > 0) {
      items.push({
        bucketId: classifyPolicyBucket(row),
        amount: Number(row.currentValue) || 0,
        label: row.name || row.id || '운용자산',
        trackName: row.name || '',
        allocatedByWeight: false,
      });
    }
  }
  return items.filter(item => item.amount > 0);
}

export function addPolicyItem(items, row, holding, amount, allocatedByWeight) {
  const pieces = policyBucketPieces(holding);
  for (const piece of pieces) {
    items.push({
      bucketId: piece.bucketId,
      amount: Math.round(amount * piece.weight),
      label: holding.name || holding.symbol || row.name || '보유종목',
      trackName: row.name || '',
      symbol: holding.symbol || '',
      allocatedByWeight,
    });
  }
}

export function policyBucketPieces(item) {
  const text = policyText(item);
  if (/438100|나스닥100미국채혼합50|나스닥.*미국채.*50/.test(text)) {
    return [{ bucketId: 'nasdaq', weight: 0.5 }, { bucketId: 'other', weight: 0.5 }];
  }
  return [{ bucketId: classifyPolicyBucket(item), weight: 1 }];
}

export function classifyPolicyBucket(item) {
  const text = policyText(item);
  if (/(qqqm|qqq|nasdaq|나스닥|379810|133690|367380|448300|미국테크top10|테크top10)/.test(text)) return 'nasdaq';
  if (/(schd|dividend|배당|다우존스|dowjones|dow jones)/.test(text)) return 'dividend';
  if (/(gld|iau|gold|금|골드|krx금|금현물|411060|132030)/.test(text)) return 'gold';
  if (/(tsla|nvda|aapl|msft|amzn|googl|goog|meta|tesla|nvidia|apple|microsoft|amazon|alphabet|테슬라|엔비디아|애플|마이크로소프트|아마존|알파벳|메타|m7|개별)/.test(text)) return 'individual';
  return 'other';
}

export function policyText(item) {
  return [item?.id, item?.symbol, item?.name, item?.market, item?.role, item?.desc, item?.broker]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function isOperatingAssetRow(row) {
  const text = `${row?.id || ''} ${row?.name || ''} ${row?.role || ''} ${row?.desc || ''}`.toLowerCase();
  return !/jeonse|전세|보증금|회수예정/.test(text);
}

export function rebalanceMoves(buckets, targetById) {
  const sources = [];
  const destinations = buckets
    .filter(bucket => TARGET_BUCKET_IDS.has(bucket.id) && bucket.diff < -10000)
    .map(bucket => ({
      id: bucket.id,
      label: targetById[bucket.id]?.short || bucket.name,
      need: Math.abs(bucket.diff),
    }))
    .sort((a, b) => b.need - a.need);

  for (const bucket of buckets) {
    const excess = bucket.id === 'other' ? bucket.amount : Math.max(0, bucket.diff);
    if (excess <= 10000) continue;
    let remaining = excess;
    const sortedItems = (bucket.items || []).slice().sort((a, b) => b.amount - a.amount);
    for (const item of sortedItems) {
      if (remaining <= 10000) break;
      const amount = Math.min(remaining, item.amount);
      sources.push({
        label: item.symbol || item.label || item.trackName || '운용자산',
        bucketId: bucket.id,
        amount,
      });
      remaining -= amount;
    }
  }

  const moves = [];
  for (const source of sources) {
    let sourceLeft = source.amount;
    for (const dest of destinations) {
      if (sourceLeft <= 10000) break;
      if (dest.need <= 10000) continue;
      const amount = Math.min(sourceLeft, dest.need);
      moves.push({ from: source.label, to: dest.label, fromBucketId: source.bucketId, toBucketId: dest.id, amount: Math.round(amount) });
      sourceLeft -= amount;
      dest.need -= amount;
    }
  }
  return moves.filter(move => move.amount >= 10000).slice(0, 6);
}

export function compactPortfolioMoveName(value) {
  const raw = String(value || '').trim();
  const text = raw
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*·\s*/g, '·')
    .replace(/\(.*?\)/g, '')
    .trim();
  const lower = text.toLowerCase();
  if (/438100\.ks|379810|133690|367380|448300|kodex.*나스닥|미국나스닥100tr|qqqm|qqq|nasdaq|나스닥/.test(lower)) return '나스닥100 ETF';
  if (/schd|배당|다우존스/.test(lower)) return '배당성장 ETF';
  if (/iau|gld|krx금|금현물|gold|골드|^금$/.test(lower)) return '금 ETF';
  if (/tsla|테슬라/.test(lower)) return '테슬라';
  if (/nvda|엔비디아/.test(lower)) return '엔비디아';
  if (/aapl|애플/.test(lower)) return '애플';
  if (/msft|마이크로소프트/.test(lower)) return '마이크로소프트';
  if (/amzn|아마존/.test(lower)) return '아마존';
  if (/googl|goog|알파벳|구글/.test(lower)) return '알파벳';
  if (/meta|메타/.test(lower)) return '메타';
  return text.length > 12 ? `${text.slice(0, 11)}…` : text;
}


function formatSharePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(1)}%`;
}
