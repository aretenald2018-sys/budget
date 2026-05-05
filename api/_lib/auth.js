// ================================================================
// api/_lib/auth.js — Bearer 토큰 검증 (Macrodroid webhook용)
// ================================================================

export function checkBearer(req, res) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'INGEST_TOKEN env 미설정' });
    return false;
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export function checkCron(req, res) {
  // Legacy HTTP cron helper. GitHub Actions jobs call the shared modules directly.
  const token = (req.query?.token) || '';
  if (token && token === process.env.INGEST_TOKEN) return true;
  res.status(401).json({ error: 'unauthorized' });
  return false;
}
