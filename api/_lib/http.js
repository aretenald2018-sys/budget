export function setCors(res, methods = ['GET', 'OPTIONS']) {
  const normalized = [...new Set(methods.map(method => String(method).toUpperCase()))];
  if (!normalized.includes('OPTIONS')) normalized.push('OPTIONS');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', normalized.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
}

export function allowMethods(req, res, methods) {
  const allowed = methods.map(method => String(method).toUpperCase());
  if (allowed.includes(req.method)) return true;
  res.status(405).json({ ok: false, error: `${allowed.join(' or ')} only` });
  return false;
}

export function errorStatus(err, fallback = 500) {
  const status = Number(err?.statusCode || err?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}
