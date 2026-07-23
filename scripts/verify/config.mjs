import fs from 'node:fs';

export const RELEASE_CONTRACT = Object.freeze(JSON.parse(
  fs.readFileSync(new URL('../../release.json', import.meta.url), 'utf8'),
));
export const RELEASE_ID = RELEASE_CONTRACT.releaseId;
const cache = RELEASE_CONTRACT.cache;
export const SOURCE_RELEASE_QUERY = '?release=';

export const CANONICAL_API_ORIGIN = 'https://budget-snowy-iota.vercel.app';
export const LEGACY_API_ORIGIN = 'https://budget-api-liart.vercel.app';
export const CANONICAL_DATA_MODULE_VERSION = cache.data;
export const CANONICAL_DATA_MODULE_SPECIFIER = 'data.js';
export const CANONICAL_APP_MODULE_VERSION = cache.appModule;
export const REWARD_WIDGET_CACHE_VERSION = cache.rewardWidget;
export const BUDGET_APK_CACHE_VERSION = cache.apk;
export const ANDROID_CAPTURE_CACHE_VERSION = cache.android;
export const REWARD_ENTRY_CRUD_VERSION = cache.rewardEntry;
export const REFACTOR_SURFACE_VERSION = cache.surface;
export const CANONICAL_APP_ENTRY_VERSION = cache.appEntry;
export const CURRENT_MODAL_CACHE_VERSION = cache.modal;
export const TX_DETAIL_COMPACT_REFUND_VERSION = REFACTOR_SURFACE_VERSION;
