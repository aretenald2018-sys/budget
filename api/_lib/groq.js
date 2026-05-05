// ================================================================
// api/_lib/groq.js — Groq OpenAI-compatible JSON helper
// ================================================================

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export function hasGroqConfig() {
  return !!process.env.GROQ_API_KEY;
}

export async function callGroqJSON(systemPrompt, userPrompt, maxTokens = 4096) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY env 미설정');

  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: Math.min(maxTokens || 2000, 8000),
      response_format: { type: 'json_object' },
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || data.error) {
    throw new Error(`Groq: ${data.error?.message || upstream.status}`);
  }
  return cleanJSON(data.choices?.[0]?.message?.content || '');
}

function cleanJSON(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const jsonSlice = extractFirstJSON(s);
  if (jsonSlice) s = jsonSlice;
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

function extractFirstJSON(text) {
  const s = String(text || '');
  const startCandidates = ['{', '[']
    .map(ch => s.indexOf(ch))
    .filter(idx => idx >= 0)
    .sort((a, b) => a - b);
  if (!startCandidates.length) return '';

  const start = startCandidates[0];
  const opener = s[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return '';
}
