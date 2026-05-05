// ================================================================
// utils/runtime.js — hosting/runtime feature detection
// ================================================================

export function isGitHubPagesHost(loc = currentLocation()) {
  return Boolean(loc?.hostname?.endsWith('.github.io'));
}

export function isLocalStaticHost(loc = currentLocation()) {
  return Boolean(
    loc
      && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)
      && /^55\d\d$/.test(loc.port || '')
  );
}

export function hasServerApi(loc = currentLocation()) {
  if (!loc || loc.protocol === 'file:') return false;
  if (isGitHubPagesHost(loc)) return false;
  if (isLocalStaticHost(loc)) return false;
  return true;
}

function currentLocation() {
  return typeof window !== 'undefined' ? window.location : null;
}
