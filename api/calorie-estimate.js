// ================================================================
// api/calorie-estimate.js — shame-free kcal saving estimates
// ================================================================

import { callGeminiJSON } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
  }

  const urge = body?.urge || {};
  const alternatives = Array.isArray(body?.alternatives) ? body.alternatives : [];
  const what = String(urge.what || '').trim();
  if (!what || alternatives.length === 0) return res.status(400).json({ error: 'urge/alternatives 필요' });

  const fallback = estimateFallback(urge, alternatives);
  try {
    const parsed = await callGeminiJSON(
      'You estimate food calorie savings. Return only JSON. Be practical, non-shaming, and concise.',
      JSON.stringify({
        instruction: [
          'Estimate kcal saved for each alternative compared with the user eating the initially desired amount.',
          'Use Korean food/common snack knowledge if exact nutrition is unavailable.',
          'Do not require user search. If portions are missing, infer reasonable portions.',
          'Return {items:[{id,savedKcal,originalKcal,chosenKcal,kcalPer100g,originalPortion,chosenPortion,confidence,note}]}',
          'savedKcal must be 0 for allow/savor choices.',
        ],
        input: {
          what,
          desireType: urge.desireType || null,
          originalPortion: urge.originalPortion || null,
          plannedPortion: urge.plannedPortion || null,
          alternatives: alternatives.map(item => ({
            id: item.id,
            type: item.type,
            title: item.title,
            desc: item.desc,
          })),
        },
        fallbackShape: fallback,
      }),
      2048
    );
    const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    if (!items.length) return res.status(200).json({ ok: true, items: fallback, fallback: true });
    return res.status(200).json({ ok: true, items: normalizeItems(items, fallback) });
  } catch (err) {
    console.warn('[calorie-estimate:fallback]', err);
    return res.status(200).json({ ok: true, items: fallback, fallback: true });
  }
}

function normalizeItems(items, fallback) {
  const byId = new Map(fallback.map(item => [item.id, item]));
  return items.map(item => {
    const base = byId.get(String(item.id)) || fallback[0] || {};
    const originalKcal = clampKcal(item.originalKcal, base.originalKcal || 0);
    const chosenKcal = clampKcal(item.chosenKcal, base.chosenKcal || 0);
    const savedKcal = clampKcal(item.savedKcal, Math.max(0, originalKcal - chosenKcal));
    return {
      id: String(item.id || base.id || ''),
      savedKcal,
      originalKcal,
      chosenKcal,
      kcalPer100g: clampKcal(item.kcalPer100g, base.kcalPer100g || 0),
      originalPortion: String(item.originalPortion || base.originalPortion || '').slice(0, 30),
      chosenPortion: String(item.chosenPortion || base.chosenPortion || '').slice(0, 30),
      confidence: Math.max(0.1, Math.min(0.98, Number(item.confidence) || base.confidence || 0.55)),
      note: String(item.note || base.note || '추정치').slice(0, 60),
    };
  });
}

function estimateFallback(urge, alternatives) {
  const originalPortion = String(urge.originalPortion || '').trim() || '처음 생각한 양';
  const plannedPortion = String(urge.plannedPortion || '').trim() || '가볍게 줄인 양';
  const basePer100 = kcalPer100g(urge.what);
  const originalG = parsePortionGrams([urge.originalPortion, urge.what].filter(Boolean).join(' '), 250);
  const plannedG = parsePortionGrams(urge.plannedPortion, Math.round(originalG * 0.35));
  const originalKcal = Math.round(originalG * basePer100 / 100);
  const reducedKcal = Math.round(plannedG * basePer100 / 100);
  const fullSaved = Math.max(0, originalKcal);
  const reducedSaved = Math.max(0, originalKcal - reducedKcal);

  return alternatives.map(item => {
    const type = String(item.type || '');
    const isAllow = type === 'allow' || type === 'savor';
    const isReduce = type === 'reduce' || /작게|줄|가볍|100g|소량|반/.test(String(item.title || item.desc || ''));
    const savedKcal = isAllow ? 0 : isReduce ? reducedSaved : fullSaved;
    return {
      id: item.id,
      savedKcal,
      originalKcal,
      chosenKcal: Math.max(0, originalKcal - savedKcal),
      kcalPer100g: basePer100,
      originalPortion,
      chosenPortion: isAllow ? originalPortion : isReduce ? plannedPortion : '이번엔 먹지 않음',
      confidence: 0.48,
      note: '음식명과 양을 바탕으로 한 추정치',
    };
  });
}

function kcalPer100g(value) {
  const text = String(value || '').toLowerCase();
  const match = [
    [/팝콘|popcorn/, 520],
    [/치킨|닭강정|fried chicken/, 290],
    [/피자|pizza/, 270],
    [/라면|ramen/, 500],
    [/떡볶이/, 220],
    [/케이크|cake/, 360],
    [/초콜릿|chocolate/, 540],
    [/아이스크림|ice.?cream/, 210],
    [/과자|스낵|칩|chip/, 520],
    [/버거|햄버거|burger/, 260],
    [/와인|wine/, 85],
  ].find(([re]) => re.test(text));
  return match?.[1] || 300;
}

function parsePortionGrams(value, fallback) {
  const text = String(value || '').toLowerCase();
  const gram = text.match(/(\d+(?:\.\d+)?)\s*(g|그램|그람)/);
  if (gram) return Math.round(Number(gram[1]));
  const kg = text.match(/(\d+(?:\.\d+)?)\s*(kg|킬로)/);
  if (kg) return Math.round(Number(kg[1]) * 1000);
  if (/라지|large|전체|한\s*통|한통/.test(text)) return 250;
  if (/미디엄|medium|보통/.test(text)) return 180;
  if (/스몰|small|작게|조금|소량/.test(text)) return 100;
  if (/반|절반/.test(text)) return Math.round(fallback * 0.5);
  return fallback;
}

function clampKcal(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(5000, n)) : Math.max(0, Math.round(Number(fallback) || 0));
}
