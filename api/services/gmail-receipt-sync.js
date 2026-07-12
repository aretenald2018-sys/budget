export const GMAIL_RECEIPT_SENDERS = [
  'no-reply@kakaopay.com',
  'noreply@kakaopay.com',
  'receipt@baemin.com',
  'noreply@baemin.com',
  'noreply@coupangeats.com',
  'receipt@coupangeats.com',
  'no-reply@coupang.com',
  'no-reply@e.coupang.com',
  'noreply@coupang.com',
  'noreply@e.coupang.com',
  'order@coupang.com',
  'order@e.coupang.com',
  'easypay_noreturn@easypay.co.kr',
  'pgadmcust@kcp.co.kr',
];

export function createGmailReceiptSyncService({ gmail, parser, enricher, pollState, logger = console }) {
  assertAdapter(gmail, ['getAccessToken', 'listMessageIds', 'getMessage', 'extractMessageDate', 'extractMessageText']);
  assertAdapter(pollState, ['getLastPollTime', 'setLastPollTime']);
  if (typeof parser !== 'function' || typeof enricher !== 'function') throw new Error('receipt parser/enricher required');

  return async function pollGmailReceipts({ sinceText = '', max = 100, pollStart = new Date(), updateLastPoll = true } = {}) {
    const requestedSinceText = parseSinceText(sinceText);
    const requestedSince = requestedSinceText ? sinceTextToKstDate(requestedSinceText) : null;
    const lastPollTime = requestedSince || await pollState.getLastPollTime();
    const token = await gmail.getAccessToken();
    const query = buildGmailQuery(lastPollTime, { sinceText: requestedSinceText });
    const ids = await gmail.listMessageIds(token, query, clampMax(max));
    const results = [];

    for (const id of ids) {
      try {
        const message = await gmail.getMessage(token, id);
        const parsed = await parser(gmail.extractMessageText(message), gmail.extractMessageDate(message));
        results.push({ id, ...await enricher(parsed, id) });
      } catch (err) {
        logger.error?.('[gmail-poll] message failed', { id, error: err.message });
        results.push({ id, action: 'error', error: err.message });
      }
    }

    if (updateLastPoll) await pollState.setLastPollTime(pollStart);
    return {
      query,
      lastPollTime: lastPollTime.toISOString(),
      pollStart: pollStart.toISOString(),
      count: ids.length,
      max: clampMax(max),
      since: requestedSinceText,
      results,
    };
  };
}

export function buildGmailQuery(afterDate, options = {}) {
  const queryDate = options.sinceText ? dateTextMinusOneDay(options.sinceText) : afterDate;
  const after = [
    queryDate.getUTCFullYear(),
    String(queryDate.getUTCMonth() + 1).padStart(2, '0'),
    String(queryDate.getUTCDate()).padStart(2, '0'),
  ].join('/');
  const senderQuery = GMAIL_RECEIPT_SENDERS.map(sender => `from:${sender}`).join(' OR ');
  const keywordQuery = [
    '"결제하신 내역"', '"결제 내역"', '"결제금액"', '"총 결제금액"',
    '"구매하신 내역"', '"구매내역"', '"주문하신 내역"', '"주문 완료"',
    '"주문이 완료되었습니다"', '"결제 완료"', '"쿠페이"', '"영수증"',
  ].join(' OR ');
  return `((${senderQuery}) OR (${keywordQuery})) after:${after}`;
}

export function parseSinceText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
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

function clampMax(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.max(1, Math.min(Math.round(n), 500));
}

function assertAdapter(adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== 'function') throw new Error(`adapter method missing: ${method}`);
  }
}
