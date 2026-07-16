import { verifyUserRequest } from './_lib/firebase-admin.js';
import { pollGmailReceipts } from './gmail-poll.js';
import { requestDashboardRefresh } from './_lib/daybird.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST only' });
  }

  try {
    await verifyUserRequest(req);
    const body = parseBody(req);
    const since = parseSinceText(req.query?.since || body.since) || kstDateText(new Date());
    const max = parseMax(req.query?.max || body.max);
    const pollStart = new Date();
    const gmail = await pollGmailReceipts({ sinceText: since, max, pollStart, updateLastPoll: true });
    const dashboard = await requestDashboardRefresh(process.env.USER_UID, 'gmail-receipt-sync')
      .catch(error => ({ queued: false, error: error.message }));

    return res.status(200).json({
      ok: true,
      since,
      gmail: summarizeGmail(gmail),
      dashboard,
    });
  } catch (err) {
    console.error('[sync-latest]', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function parseSinceText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return text;
}

function parseMax(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 40;
  return Math.max(1, Math.min(Math.round(n), 120));
}

function kstDateText(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function summarizeGmail(result) {
  const rows = Array.isArray(result.results) ? result.results : [];
  return {
    query: result.query,
    count: result.count || 0,
    created: rows.filter(r => r.action === 'created').length,
    enriched: rows.filter(r => r.action === 'enriched').length,
    updated: rows.filter(r => r.action === 'updated').length,
    skipped: rows.filter(r => r.action === 'skipped').length,
    errors: rows.filter(r => r.action === 'error').length,
    results: rows,
  };
}
