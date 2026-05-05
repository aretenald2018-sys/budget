// ================================================================
// api/client-parse.js — Gemini key를 서버 env에 숨긴 파싱 프록시
// ================================================================

import { callGeminiJSON } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
  }

  const { systemPrompt, userPrompt, maxTokens = 4096 } = body || {};
  if (!systemPrompt || !userPrompt) return res.status(400).json({ error: 'systemPrompt/userPrompt 필요' });

  try {
    const parsed = await callGeminiJSON(systemPrompt, userPrompt, maxTokens);
    return res.status(200).json({ ok: true, parsed });
  } catch (err) {
    console.error('[client-parse]', err);
    const status = err.code === 'AI_QUOTA_EXCEEDED' ? 429 : (err.status || 500);
    return res.status(status).json({
      error: err.message,
      code: err.code || null,
      retryAfterMs: Number(err.retryAfterMs) || 0,
    });
  }
}
