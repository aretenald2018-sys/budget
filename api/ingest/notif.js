// ================================================================
// api/ingest/notif.js — Macrodroid Notification webhook
//
// 입력 (POST JSON):
//   { sender, body, app, receivedAt }
//   - sender: 알림 타이틀 (예: "신한은행" — 카톡 알림톡 발신자)
//   - app: 패키지명 (com.kakao.talk, com.kbstar.kbbank, viva.republica.toss …)
// ================================================================

import { checkBearer } from '../_lib/auth.js';
import { ingestAndParse } from '../_lib/auto-ingest.js';
import { normalizeIncomingPayload, parseRequestBody } from '../_lib/request-payload.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkBearer(req, res)) return;

  try {
    const payload = normalizeIncomingPayload({ ...parseRequestBody(req), ...(req.query || {}) }, { source: 'notif' });
    const result = await ingestAndParse(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[ingest/notif]', err);
    if (err.rawId) {
      return res.status(200).json({ ok: true, rawId: err.rawId, status: 'pending', parseError: err.message });
    }
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
