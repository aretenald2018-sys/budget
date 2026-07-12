export function firstEnv(names, env = process.env) {
  for (const name of names) {
    const value = String(env?.[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function requireEnv(names, env = process.env) {
  const candidates = Array.isArray(names) ? names : [names];
  const value = firstEnv(candidates, env);
  if (value) return value;
  const err = new Error(`${candidates.join('/')} env missing`);
  err.code = 'ENV_MISSING';
  err.statusCode = 500;
  throw err;
}
