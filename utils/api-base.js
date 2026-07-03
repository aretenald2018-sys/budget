// ================================================================
// utils/api-base.js — optional external API bridge configuration
// ================================================================

import { apiBaseUrl } from '../config.js?v=20260703-native-ingest-api-origin';

const STORAGE_KEY = 'budget.apiBase';

export function configuredApiBase(loc = currentLocation()) {
  const candidates = [
    runtimeWindowBase(),
    metaApiBase(),
    storageApiBase(),
    apiBaseUrl,
  ];
  for (const value of candidates) {
    const normalized = normalizeApiBase(value, loc);
    if (normalized) return normalized;
  }
  return '';
}

export function externalApiUrl(path, params = {}, loc = currentLocation()) {
  const base = configuredApiBase(loc);
  if (!base) return '';
  try {
    const url = new URL(path, `${base}/`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.href;
  } catch {
    return '';
  }
}

function runtimeWindowBase() {
  return typeof window !== 'undefined' ? window.BUDGET_API_BASE : '';
}

function metaApiBase() {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="budget-api-base"]')?.content || '';
}

function storageApiBase() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : '';
  } catch {
    return '';
  }
}

function normalizeApiBase(value, loc) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw, loc?.href || 'https://example.invalid/');
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function currentLocation() {
  return typeof window !== 'undefined' ? window.location : null;
}
