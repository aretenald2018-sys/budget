import { pollGmailReceipts } from '../api/gmail-poll.js';
import { processPendingStoredRawMessages } from '../api/_lib/auto-ingest.js';

async function main() {
  const since = parseSinceText(process.env.BUDGET_SYNC_SINCE) || kstDateText(new Date());
  const max = parseMax(process.env.BUDGET_SYNC_MAX);
  const pollStart = new Date();
  const [gmailResult, rawResult] = await Promise.allSettled([
    pollGmailReceipts({ sinceText: since, max, pollStart, updateLastPoll: true }),
    processPendingStoredRawMessages({ max: 25 }),
  ]);

  const output = {
    ok: gmailResult.status === 'fulfilled' && rawResult.status === 'fulfilled',
    since,
    gmail: summarizeSettledGmail(gmailResult),
    raw: summarizeSettledRaw(rawResult),
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(1);
}

function summarizeSettledGmail(result) {
  if (result.status === 'rejected') return { error: result.reason?.message || String(result.reason) };
  const rows = Array.isArray(result.value.results) ? result.value.results : [];
  return {
    query: result.value.query,
    count: result.value.count || 0,
    created: rows.filter(row => row.action === 'created').length,
    enriched: rows.filter(row => row.action === 'enriched').length,
    updated: rows.filter(row => row.action === 'updated').length,
    skipped: rows.filter(row => row.action === 'skipped').length,
    errors: rows.filter(row => row.action === 'error').length,
  };
}

function summarizeSettledRaw(result) {
  if (result.status === 'rejected') return { error: result.reason?.message || String(result.reason) };
  return result.value;
}

function parseSinceText(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseMax(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.max(1, Math.min(Math.round(n), 500));
}

function kstDateText(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

main().catch(err => {
  console.error('[github-sync-latest]', err);
  process.exit(1);
});
