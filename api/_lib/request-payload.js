// ================================================================
// api/_lib/request-payload.js — MacroDroid SMS/MMS/notification payload normalizer
// ================================================================

export function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body !== 'string') return {};

  const raw = req.body.trim();
  if (!raw) return {};
  if (String(req.headers?.['content-type'] || '').toLowerCase().startsWith('text/plain')) {
    return { body: req.body };
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try { return JSON.parse(raw); } catch { return { body: req.body }; }
  }
  return parseFormLike(req.body);
}

export function normalizeIncomingPayload(input, defaults = {}) {
  const body = input || {};
  const source = firstText(body.source, defaults.source) || (firstText(body.app, body.notification_app_package) ? 'notif' : 'sms');
  const sender = firstText(
    body.sender, body.from, body.number, body.phone, body.address,
    body.notification_title, body.not_title, body.title, defaults.sender
  );
  const app = firstText(body.app, body.package, body.notification_app_package, defaults.app);
  const receivedAt = body.receivedAt || body.timestamp || body.time || body.date || defaults.receivedAt || null;
  const text = buildMessageText(body, defaults.body);

  if (!text || isUnresolvedMacroText(text)) {
    const err = new Error(`메시지 본문 없음. 받은 필드: ${Object.keys(body).slice(0, 20).join(', ') || '(none)'}`);
    err.statusCode = 400;
    throw err;
  }

  return {
    source,
    sender: sender || null,
    app: app || null,
    body: text,
    receivedAt,
    meta: collectMeta(body),
  };
}

function isUnresolvedMacroText(text) {
  const compact = String(text || '').trim();
  if (!compact) return true;
  return /^\[[a-zA-Z0-9_ =.-]+\]$/.test(compact);
}

function buildMessageText(body, fallback) {
  const parts = [
    body.body, body.text, body.message, body.sms, body.content, body.contents,
    body.mmsText, body.mms_text, body.subject, body.mmsSubject, body.mms_subject,
    body.notification, body.not_text, body.not_text_lines, body.not_big_text,
    body.notification_text, body.notification_big_text, body.notification_ticker_text,
    body.title && body.text ? `${body.title} ${body.text}` : '',
    body.not_title && body.notification ? `${body.not_title} ${body.notification}` : '',
    fallback,
  ].flatMap(valueToText).map(s => s.trim()).filter(Boolean);
  return [...new Set(parts)].join('\n').trim();
}

function parseFormLike(text) {
  const out = {};
  for (const part of String(text || '').split(/[&\n]/)) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      out[key] = value;
    }
  }
  if (Object.keys(out).length === 0 && String(text || '').trim()) out.body = String(text).trim();
  return out;
}

function firstText(...values) {
  for (const value of values) {
    const text = valueToText(value).join(' ').trim();
    if (text) return text;
  }
  return '';
}

function valueToText(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(valueToText);
  if (typeof value === 'object') return [JSON.stringify(value)];
  return [String(value)];
}

function collectMeta(body) {
  const meta = {};
  for (const key of ['mmsAttachments', 'mms_attachments', 'attachmentCount', 'simSlot', 'subscriptionId']) {
    if (body[key] != null) meta[key] = body[key];
  }
  return meta;
}
