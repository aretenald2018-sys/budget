import { syncTelegramPublicFeed } from '../api/_lib/telegram-public-feed.js';

const args = parseArgs(process.argv.slice(2));

syncTelegramPublicFeed({
  dryRun: args.dryRun,
  limitSources: args.limitSources || process.env.TELEGRAM_PUBLIC_LIMIT_SOURCES,
  onlySources: args.onlySources || process.env.TELEGRAM_PUBLIC_ONLY_SOURCES,
  maxMessages: args.maxMessages || process.env.TELEGRAM_PUBLIC_MAX_PER_SOURCE,
  concurrency: args.concurrency || process.env.TELEGRAM_PUBLIC_CONCURRENCY,
}).catch(err => {
  console.error('[telegram-feed-sync]', err);
  process.exit(1);
});

function parseArgs(argv) {
  const result = {
    dryRun: false,
    limitSources: '',
    onlySources: '',
    maxMessages: '',
    concurrency: '',
  };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (key in result) result[key] = match[2];
  }
  return result;
}
