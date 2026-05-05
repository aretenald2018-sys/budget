import { ingestAndParse, diagnosticResult } from '../api/_lib/auto-ingest.js';
import { normalizeIncomingPayload } from '../api/_lib/request-payload.js';

async function main() {
  const rawPayload = readDispatchPayload();
  const payload = normalizeIncomingPayload(rawPayload.payload || rawPayload);
  try {
    const result = await ingestAndParse(payload);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (err) {
    if (err.rawId) {
      console.log(JSON.stringify({
        ok: true,
        ...diagnosticResult(err.payload || payload, {
          rawId: err.rawId,
          status: 'pending',
          parseError: err.message,
        }),
      }, null, 2));
      return;
    }
    throw err;
  }
}

function readDispatchPayload() {
  const text = String(process.env.BUDGET_INGEST_PAYLOAD || '').trim();
  if (!text) throw new Error('BUDGET_INGEST_PAYLOAD is required');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid BUDGET_INGEST_PAYLOAD JSON: ${err.message}`);
  }
}

main().catch(err => {
  console.error('[github-ingest]', err);
  process.exit(1);
});
