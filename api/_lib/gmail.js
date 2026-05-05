const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_TEXT_CHARS = 6000;

export async function getAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN env missing');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Gmail token ${res.status}`);
  if (!data.access_token) throw new Error('Gmail access_token missing');
  return data.access_token;
}

export async function listMessageIds(token, query, max = 50) {
  const limit = Math.max(1, Math.min(Number(max) || 50, 500));
  const ids = [];
  let pageToken = '';

  while (ids.length < limit) {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', String(Math.min(100, limit - ids.length)));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await gmailFetchJSON(token, url);
    ids.push(...(data.messages || []).map(m => m.id).filter(Boolean));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }

  return ids.slice(0, limit);
}

export async function getMessage(token, messageId) {
  const url = new URL(`${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set('format', 'full');
  return gmailFetchJSON(token, url);
}

export function extractMessageText(message) {
  const plain = findPartBody(message.payload, 'text/plain');
  if (plain) return truncate(normalizePlainText(plain));
  const html = findPartBody(message.payload, 'text/html');
  if (html) return truncate(normalizeHtmlText(html));
  return truncate(cleanText(message.snippet || ''));
}

export function extractMessageDate(message) {
  const headerDate = getHeader(message, 'date');
  const parsedHeader = headerDate ? new Date(headerDate) : null;
  if (parsedHeader && !Number.isNaN(parsedHeader.getTime())) return parsedHeader;
  const internalDate = Number(message.internalDate);
  if (Number.isFinite(internalDate)) return new Date(internalDate);
  return new Date();
}

async function gmailFetchJSON(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gmail ${res.status}`);
  return data;
}

function findPartBody(part, mimeType) {
  if (!part) return '';
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const found = findPartBody(child, mimeType);
    if (found) return found;
  }
  return '';
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function getHeader(message, name) {
  const headers = message.payload?.headers || [];
  const found = headers.find(h => String(h.name || '').toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '));
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value) {
  return decodeHtmlEntities(String(value || '')).replace(/\s+/g, ' ').trim();
}

// plain text: 줄바꿈 보존, 각 줄 내부 공백만 정리
function normalizePlainText(value) {
  return decodeHtmlEntities(String(value || ''))
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

// HTML → 태그 제거 후 줄바꿈 보존
function normalizeHtmlText(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function truncate(value) {
  return String(value || '').slice(0, MAX_TEXT_CHARS);
}
