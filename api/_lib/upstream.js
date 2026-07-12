const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchJsonWithTimeout(url, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = clampTimeout(options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutError = new Error(`${options.label || 'upstream'} timeout after ${timeoutMs}ms`);
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry(operation, options = {}) {
  const attempts = Math.max(1, Math.min(3, Math.round(Number(options.attempts) || 1)));
  const shouldRetry = options.shouldRetry || defaultShouldRetry;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !shouldRetry(err)) throw err;
    }
  }
  throw lastError;
}

export function defaultShouldRetry(err) {
  const status = Number(err?.statusCode || err?.status);
  return err?.code === 'UPSTREAM_TIMEOUT' || status === 429 || status >= 500;
}

function clampTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(100, Math.min(Math.round(timeout), 60_000));
}
