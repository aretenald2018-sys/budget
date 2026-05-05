// ================================================================
// api/client-config.js — 브라우저가 raw mailbox를 찾기 위한 공개 설정
// ================================================================

import { mailboxIdFromIngestToken } from './_lib/firestore-rest.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    return res.status(200).json({ ok: true, mailboxId: mailboxIdFromIngestToken() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
