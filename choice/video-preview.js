// ================================================================
// choice/video-preview.js - direct visual helpers for pasted media URLs
// ================================================================

import {
  domainFromUrl,
  safeExternalUrl,
} from './share-preview.js?v=20260505-visual-modal';

export function directVisualFromUrl(url, title = '') {
  const safe = safeExternalUrl(url);
  if (!safe) return null;
  const youtube = youtubeVisualFromUrl(safe);
  if (youtube) return { ...youtube, title: title || youtube.title };
  if (!isLikelyDirectImageUrl(safe)) return null;
  return {
    provider: 'direct-image',
    title: title || '이미지 후보',
    imageUrl: safe,
    domain: domainFromUrl(safe),
  };
}

export function youtubeVisualFromUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || '';
      if (!id) id = parsed.searchParams.get('v') || '';
    }
    id = normalizeYoutubeId(id);
    if (!id) return null;
    return {
      provider: 'youtube',
      title: parts[0] === 'shorts' ? 'YouTube Shorts' : 'YouTube 영상',
      imageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      domain: 'youtube.com',
      videoId: id,
    };
  } catch {
    return null;
  }
}

export function isLikelyDirectImageUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    const path = parsed.pathname.toLowerCase();
    if (/\.(jpe?g|png|webp|gif|avif)(?:$)/.test(path)) return true;
    return /(?:image|img|photo|thumb|thumbnail|media)/i.test(parsed.hostname + parsed.pathname)
      && !/(html?|php|asp|aspx)(?:$)/i.test(path);
  } catch {
    return false;
  }
}

function normalizeYoutubeId(value) {
  const match = String(value || '').match(/[A-Za-z0-9_-]{11}/);
  return match ? match[0] : '';
}
