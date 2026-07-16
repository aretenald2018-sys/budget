import { verifyUserRequest } from './_lib/firebase-admin.js';
import { gmailAdapter } from './_adapters/gmail.js';
import { gmailPollStateAdapter } from './_adapters/gmail-poll-state.js';
import { receiptProcessingAdapter } from './_adapters/receipt-processing.js';
import {
  buildGmailQuery,
  createGmailReceiptSyncService,
  GMAIL_RECEIPT_SENDERS,
  parseSinceText,
} from './_services/gmail-receipt-sync.js';

export const SENDERS = GMAIL_RECEIPT_SENDERS;
export { buildGmailQuery };

export const pollGmailReceipts = createGmailReceiptSyncService({
  gmail: gmailAdapter,
  parser: receiptProcessingAdapter.parse,
  enricher: receiptProcessingAdapter.enrich,
  pollState: gmailPollStateAdapter,
});

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST only' });
  }
  const pollStart = new Date();
  try {
    await verifyUserRequest(req);
    const result = await pollGmailReceipts({
      sinceText: parseSinceText(req.query?.since),
      max: parseMax(req.query?.max),
      pollStart,
      updateLastPoll: true,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[gmail-poll]', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

function parseMax(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.max(1, Math.min(Math.round(n), 500));
}
