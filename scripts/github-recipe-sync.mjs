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
  console.error('[github-recipe-sync]', err);
  process.exit(1);
});
