// ================================================================
// api/urge-suggest.js — Gemini purchase-urge alternative suggestions
// ================================================================

import { callGeminiJSON } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
  }
  const what = String(body?.what || '').trim();
  const price = Math.max(0, Math.round(Number(body?.price) || 0));
  if (!what) return res.status(400).json({ error: 'what 필요' });

  const fallback = fallbackAlternatives({ ...body, what, price });
  try {
    const parsed = await callGeminiJSON(
      'You are a Korean, shame-free budgeting coach. Return only JSON.',
      JSON.stringify({
        instruction: [
          'Generate exactly four purchase-urge alternatives.',
          'Two should be substitute activities, one should be a reduced same-category option, one must allow purchase.',
          'Never shame, forbid, or use alarmist language.',
          'Each item: id, type(substitute|reduce|allow|pause), emoji, title, desc, savedAmount, badge.',
          'savedAmount for allow is 0. Korean UI copy, concise.',
        ],
        input: { what, price, category: body?.category || null, mood: body?.mood || null, context: body?.context || null },
        fallbackShape: fallback,
      }),
      2048
    );
    const alternatives = Array.isArray(parsed) ? parsed : parsed?.alternatives;
    if (!Array.isArray(alternatives) || alternatives.length < 4) {
      return res.status(200).json({ ok: true, alternatives: fallback, fallback: true });
    }
    return res.status(200).json({
      ok: true,
      alternatives: normalizeAlternatives(alternatives, fallback, price).slice(0, 4),
    });
  } catch (err) {
    console.warn('[urge-suggest:fallback]', err);
    return res.status(200).json({ ok: true, alternatives: fallback, fallback: true });
  }
}

function normalizeAlternatives(items, fallback, price) {
  const normalized = items.map((item, index) => ({
    id: String(item.id || fallback[index]?.id || `alt-${index + 1}`).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || `alt-${index + 1}`,
    type: ['substitute', 'reduce', 'allow', 'pause'].includes(item.type) ? item.type : fallback[index]?.type || 'substitute',
    emoji: String(item.emoji || fallback[index]?.emoji || '🌿').slice(0, 4),
    title: String(item.title || fallback[index]?.title || '잠깐 미루기').slice(0, 40),
    desc: String(item.desc || fallback[index]?.desc || '마음을 보고 다시 선택해요.').slice(0, 90),
    savedAmount: Math.max(0, Math.min(price, Math.round(Number(item.savedAmount) || 0))),
    badge: String(item.badge || fallback[index]?.badge || '균형 선택').slice(0, 20),
  }));
  if (!normalized.some(item => item.type === 'allow')) normalized[normalized.length - 1] = fallback[3];
  return normalized;
}

function fallbackAlternatives({ what, price, category, mood }) {
  const stress = /긴장|허전|지쳐|보상/.test(String(mood || ''));
  const reduce = Math.max(0, Math.round(price * 0.375 / 1000) * 1000);
  return [
    { id: 'walk', type: 'substitute', emoji: '◌', title: '짧은 산책 (15분)', desc: '바람을 쐬고 와도 괜찮아요. 마음이 조금 가라앉은 뒤 다시 봐요.', savedAmount: price, badge: '균형 선택' },
    { id: 'drive', type: 'substitute', emoji: '◇', title: stress ? '밤 드라이빙' : '가벼운 기분 전환', desc: stress ? '짧게 돌아오고, 그래도 마음이 같으면 그때 다시 봐요.' : '지금 사고 싶은 마음을 다른 만족으로 바꿔봐요.', savedAmount: price, badge: '스트레스 우회' },
    { id: 'reduce', type: 'reduce', emoji: category?.includes('와인') ? '◈' : '◒', title: `${Math.max(0, price - reduce).toLocaleString('ko-KR')}원짜리 선택`, desc: '같은 만족을 남기되 이번 선택의 무게만 조금 줄여요.', savedAmount: reduce, badge: '가벼운 선택' },
    { id: 'allow', type: 'allow', emoji: category?.includes('와인') ? '◈' : '◌', title: `그래도 ${what} 살래요`, desc: '한 번의 선택일 뿐이에요. 결제가 들어오면 연결해서 기록할게요.', savedAmount: 0, badge: '한 번의 선택' },
  ];
}
