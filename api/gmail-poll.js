import { getAdminDb, userScope, FieldValue, Timestamp } from './_lib/firebase-admin.js';
import { getAccessToken, getMessage, listMessageIds, extractMessageDate, extractMessageText } from './_lib/gmail.js';
import { parseReceiptEmail } from './_lib/receipt-parser.js';
import { processReceipt } from './_lib/receipt-enricher.js';

export const SENDERS = [
  'no-reply@kakaopay.com',
  'noreply@kakaopay.com',
  'receipt@baemin.com',
  'noreply@baemin.com',
  'noreply@coupangeats.com',
  'receipt@coupangeats.com',
  'noreply@coupang.com',
  'noreply@e.coupang.com',
  'easypay_noreturn@easypay.co.kr',
  'pgadmcust@kcp.co.kr',
];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST only' });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const pollStart = new Date();
  try {
    const requestedSinceText = parseSinceText(req.query?.since);
    const max = parseMax(req.query?.max);
    const result = await pollGmailReceipts({
      sinceText: requestedSinceText,
      max,
      pollStart,
      updateLastPoll: true,
    });
    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('[gmail-poll]', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function pollGmailReceipts({ sinceText = '', max = 100, pollStart = new Date(), updateLastPoll = true } = {}) {
  const requestedSinceText = parseSinceText(sinceText);
  const requestedSince = requestedSinceText ? sinceTextToKstDate(requestedSinceText) : null;
  const lastPollTime = requestedSince || await getLastPollTime();
  const token = await getAccessToken();
  const query = buildGmailQuery(lastPollTime, { sinceText: requestedSinceText });
  const ids = await listMessageIds(token, query, max);
  const results = [];

  for (const id of ids) {
    try {
      const message = await getMessage(token, id);
      const emailDate = extractMessageDate(message);
      const text = extractMessageText(message);
      const parsed = await parseReceiptEmail(text, emailDate);
      const result = await processReceipt(parsed, id);
      results.push({ id, ...result });
    } catch (err) {
      console.error('[gmail-poll] message failed', { id, error: err.message });
      results.push({ id, action: 'error', error: err.message });
    }
  }

  if (updateLastPoll) await setLastPollTime(pollStart);
  return {
    query,
    lastPollTime: lastPollTime.toISOString(),
    pollStart: pollStart.toISOString(),
    count: ids.length,
    max,
    since: requestedSinceText,
    results,
  };
}

function isAuthorized(req) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return false;
  if (req.query?.token === expected) return true;
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') && auth.slice(7) === expected;
}

function buildGmailQuery(afterDate, options = {}) {
  const queryDate = options.sinceText
    ? dateTextMinusOneDay(options.sinceText)
    : afterDate;
  const after = [
    queryDate.getUTCFullYear(),
    String(queryDate.getUTCMonth() + 1).padStart(2, '0'),
    String(queryDate.getUTCDate()).padStart(2, '0'),
  ].join('/');
  const senderQuery = SENDERS.map(sender => `from:${sender}`).join(' OR ');
  const keywordQuery = [
    '"결제하신 내역"',
    '"결제 내역"',
    '"결제금액"',
    '"총 결제금액"',
    '"구매내역"',
    '"주문하신 내역"',
    '"영수증"',
  ].join(' OR ');
  return `((${senderQuery}) OR (${keywordQuery})) after:${after}`;
}

function parseSinceText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('since must be YYYY-MM-DD');
  const date = sinceTextToKstDate(text);
  if (Number.isNaN(date.getTime())) throw new Error('invalid since date');
  return text;
}

function sinceTextToKstDate(text) {
  return new Date(`${text}T00:00:00+09:00`);
}

function dateTextMinusOneDay(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1));
}

function parseMax(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.max(1, Math.min(Math.round(n), 500));
}

async function getLastPollTime() {
  const ref = metaRef();
  const snap = await ref.get();
  const value = snap.exists ? snap.data().lastPollTime : null;
  if (value?.toDate) return value.toDate();
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function setLastPollTime(date) {
  await metaRef().set({
    lastPollTime: Timestamp.fromDate(date),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function metaRef() {
  return getAdminDb().collection('users').doc(userScope()).collection('meta').doc('gmail_poll');
}
