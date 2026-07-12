export function domainFromUrl(value) {
  try {
    return new URL(String(value || '').trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function sourcePlatformKeyFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url)) return 'instagram';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  return '';
}

export function sourcePlatformFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url)) return { platform: 'youtube', label: 'YT', name: 'YouTube', className: 'yt' };
  if (/instagram\.com\/reel/.test(url)) return { platform: 'instagram', label: 'REELS', name: 'Instagram', className: 'ig' };
  if (/instagram\.com/.test(url)) return { platform: 'instagram', label: 'IG', name: 'Instagram', className: 'ig' };
  if (/tiktok\.com/.test(url)) return { platform: 'tiktok', label: 'TT', name: 'TikTok', className: 'tk' };
  return { platform: 'web', label: 'WEB', name: 'Web', className: 'web' };
}
