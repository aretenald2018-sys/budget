// ================================================================
// api/_lib/llm-router.js — Gemini/Groq JSON router
// ================================================================

import { callGeminiJSON } from './gemini.js';
import { callGroqJSON, hasGroqConfig } from './groq.js';

export async function callLLMJSON(systemPrompt, userPrompt, maxTokens = 4096, opts = {}) {
  const prefer = String(opts.prefer || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const providers = prefer === 'groq'
    ? ['groq', 'gemini']
    : ['gemini', 'groq'];
  let lastErr = null;

  for (const provider of providers) {
    if (provider === 'groq' && !hasGroqConfig()) continue;
    try {
      const data = provider === 'groq'
        ? await callGroqJSON(systemPrompt, userPrompt, maxTokens)
        : await callGeminiJSON(systemPrompt, userPrompt, maxTokens);
      return { data, provider };
    } catch (err) {
      lastErr = err;
      if (provider === 'gemini' && providers.includes('groq') && shouldTryGroqAfterGemini(err)) {
        console.warn('[llm-router] Gemini failed, trying Groq:', err.message);
        continue;
      }
      if (provider === 'groq' && providers.includes('gemini')) {
        console.warn('[llm-router] Groq failed, trying Gemini:', err.message);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('사용 가능한 LLM provider가 없습니다.');
}

function shouldTryGroqAfterGemini(err) {
  const message = String(err?.message || '').toLowerCase();
  return /quota|rate.?limit|exceeded|resource[_-]?exhausted|try again|429|500|503|overloaded/.test(message);
}
