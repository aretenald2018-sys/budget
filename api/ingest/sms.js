// ================================================================
// api/ingest/sms.js — Macrodroid SMS webhook
//
// 입력 (POST JSON):
//   { sender: string, body: string, receivedAt: number(unix sec) }
// 인증:
//   Authorization: Bearer <INGEST_TOKEN>
// 동작:
//   raw_messages 컬렉션에 status='pending'으로 저장.
// ================================================================

import { checkBearer } from '../_lib/auth.js';
import { ingestAndParse } from '../_lib/auto-ingest.js';
import { normalizeIncomingPayload, parseRequestBody } from '../_lib/request-payload.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkBearer(req, res)) return;

  try {
    const payload = normalizeIncomingPayload({ ...parseRequestBody(req), ...(req.query || {}) }, { source: 'sms' });
    const result = await ingestAndParse(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[ingest/sms]', err);
    if (err.rawId) {
      return res.status(200).json({ ok: true, rawId: err.rawId, status: 'pending', parseError: err.message });
    }
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
