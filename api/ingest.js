// ================================================================
// api/ingest.js — MacroDroid 통합 raw webhook
// ================================================================

import { checkBearer } from './_lib/auth.js';
import { diagnosticResult, ingestAndParse } from './_lib/auto-ingest.js';
import { normalizeIncomingPayload, parseRequestBody } from './_lib/request-payload.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkBearer(req, res)) return;

  try {
    const merged = { ...parseRequestBody(req), ...(req.query || {}) };
    const payload = normalizeIncomingPayload(merged);
    const result = await ingestAndParse(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[ingest]', err);
    if (err.statusCode === 400) {
      const rawHead = typeof req.body === 'string' ? req.body.slice(0, 300) : JSON.stringify(req.body).slice(0, 300);
      console.error('[ingest] 400 detail', {
        contentType: String(req.headers['content-type'] || ''),
        query: req.query || {},
        bodyType: typeof req.body,
        bodyHead: rawHead,
      });
    }
    if (err.rawId) {
      return res.status(200).json({
        ok: true,
        ...diagnosticResult(err.payload, {
          rawId: err.rawId,
          status: 'pending',
          parseError: err.message,
        }),
      });
    }
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
