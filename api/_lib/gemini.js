// ================================================================
// api/_lib/gemini.js — Gemini JSON helper
// ================================================================

const MODEL = 'gemini-flash-latest';

export async function callGeminiJSON(systemPrompt, userPrompt, maxTokens = 4096) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY env 미설정');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  const data = await upstream.json();
  if (data.error) {
    const err = new Error(`Gemini: ${data.error.message}`);
    err.status = upstream.status;
    err.code = data.error.status === 'RESOURCE_EXHAUSTED' || upstream.status === 429
      ? 'AI_QUOTA_EXCEEDED'
      : data.error.status;
    err.retryAfterMs = extractRetryAfterMs(data.error.message);
    throw err;
  }
  return cleanJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

function extractRetryAfterMs(message = '') {
  const match = String(message).match(/retry in\s+([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : 0;
}

function cleanJSON(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = Math.min(
    s.indexOf('{') === -1 ? Infinity : s.indexOf('{'),
    s.indexOf('[') === -1 ? Infinity : s.indexOf('[')
  );
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (start !== Infinity && end > start) s = s.substring(start, end + 1);
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}
