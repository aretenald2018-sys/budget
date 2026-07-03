import { processPendingRecipeItems } from '../api/_lib/recipe-analysis.js';

async function main() {
  const max = parsePositiveInt(process.env.BUDGET_RECIPE_MAX, 10);
  const lookback = parsePositiveInt(process.env.BUDGET_RECIPE_LOOKBACK, 80);
  const result = await processPendingRecipeItems({ max, lookback });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(Math.round(n), 200));
}

main().catch(err => {
  if (isFirestoreQuotaError(err)) {
    console.warn('[github-recipe-sync] Firestore quota exhausted; skipping recipe analysis for this run.', errorSummary(err));
    console.log(JSON.stringify({
      ok: true,
      status: 'skipped',
      reason: 'firestore_quota_exhausted',
      error: errorSummary(err),
    }, null, 2));
    process.exitCode = 0;
    return;
  }
  console.error('[github-recipe-sync]', err);
  process.exit(1);
});

function isFirestoreQuotaError(err) {
  const text = errorText(err);
  return Number(err?.code) === 8 && /resource[_\s-]?exhausted|quota/i.test(text);
}

function errorSummary(err) {
  const message = String(err?.message || err || '').trim();
  const details = String(err?.details || '').trim();
  if (details && message && !message.includes(details)) return `${message}: ${details}`;
  return message || details || 'Quota exceeded.';
}

function errorText(err) {
  return [
    err?.message,
    err?.details,
    err?.code,
    err?.stack,
  ].filter(Boolean).map(String).join('\n');
}
