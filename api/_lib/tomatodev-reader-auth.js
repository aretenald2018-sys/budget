const IDENTITY_TOOLKIT_SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const defaultTokenCache = new Map();

export async function getTomatoDevReaderIdToken(options = {}) {
  const credentials = readerCredentials(options);
  const fetchImpl = options.fetchImpl || fetch;
  const cache = options.tokenCache || defaultTokenCache;
  const cacheKey = `${credentials.projectId}\0${credentials.apiKey}\0${credentials.email}`;
  const nowEpochMs = finiteEpoch(options.nowEpochMs);
  const cached = cache.get(cacheKey);
  if (!options.forceRefresh && cached?.idToken
    && Number(cached.expiresAtEpochMs) - TOKEN_REFRESH_SKEW_MS > nowEpochMs) {
    return cached.idToken;
  }
  if (cached?.pending) return cached.pending;

  const pending = signInReader({ ...credentials, fetchImpl, nowEpochMs })
    .then(result => {
      cache.set(cacheKey, result);
      return result.idToken;
    })
    .catch(error => {
      if (cache.get(cacheKey)?.pending === pending) cache.delete(cacheKey);
      throw error;
    });
  cache.set(cacheKey, { pending });
  return pending;
}

export async function fetchWithTomatoDevReaderAuth(url, request = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const requestWithToken = async forceRefresh => {
    const idToken = await getTomatoDevReaderIdToken({ ...options, fetchImpl, forceRefresh });
    return fetchImpl(url, {
      ...request,
      headers: authorizationHeaders(request.headers, idToken),
    });
  };
  let response = await requestWithToken(false);
  if (response?.status === 401 || response?.status === 403) {
    response = await requestWithToken(true);
  }
  return response;
}

async function signInReader({ fetchImpl, apiKey, email, password, nowEpochMs }) {
  const endpoint = `${IDENTITY_TOOLKIT_SIGN_IN_URL}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await response.json().catch(() => ({}));
  const idToken = String(payload?.idToken || '').trim();
  const expiresInSeconds = Number(payload?.expiresIn);
  if (!response.ok || !idToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw unavailableError(`TomatoDev reader authentication failed: ${Number(response?.status) || 500}`);
  }
  return {
    idToken,
    expiresAtEpochMs: nowEpochMs + expiresInSeconds * 1000,
  };
}

function readerCredentials(options) {
  const env = options.env || process.env;
  const email = String(options.email ?? env.TOMATODEV_READER_EMAIL ?? '').trim();
  const password = String(options.password ?? env.TOMATODEV_READER_PASSWORD ?? '');
  const projectId = String(options.projectId || '').trim();
  const apiKey = String(options.apiKey || '').trim();
  const missing = [];
  if (!email) missing.push('TOMATODEV_READER_EMAIL');
  if (!password) missing.push('TOMATODEV_READER_PASSWORD');
  if (!projectId) missing.push('TOMATODEV_FIREBASE_PROJECT_ID');
  if (!apiKey) missing.push('TOMATODEV_FIREBASE_API_KEY');
  if (missing.length) throw unavailableError(`${missing.join('/')} env missing`);
  return { email, password, projectId, apiKey };
}

function authorizationHeaders(source, idToken) {
  const headers = {};
  if (source && typeof source.forEach === 'function') {
    source.forEach((value, key) => { headers[key] = value; });
  } else if (source && typeof source === 'object') {
    Object.assign(headers, source);
  }
  headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

function finiteEpoch(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function unavailableError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = 'TOMATODEV_READER_UNAVAILABLE';
  return error;
}
