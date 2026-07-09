const EARTH_RADIUS_METERS = 6371008.8;

export function normalizeRoutePoints(activity = {}) {
  let bestPoints = [];
  for (const candidates of routePointCandidateSets(activity)) {
    const points = normalizeCandidatePoints(candidates);
    if (betterRouteCandidate(points, bestPoints)) bestPoints = points;
  }
  return withCumulativeDistance(bestPoints);
}

export function routeDistance(points) {
  if (!points.length) return 0;
  const last = points[points.length - 1];
  if (Number.isFinite(last.cumulativeMeters)) return last.cumulativeMeters;
  return withCumulativeDistance(points).at(-1)?.cumulativeMeters || 0;
}

export function routeBounds(points) {
  if (!points.length) return { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 };
  const lats = points.map(point => point.lat);
  const lngs = points.map(point => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max(0.00025, (maxLat - minLat) * 0.08);
  const lngPad = Math.max(0.00025, (maxLng - minLng) * 0.08);
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
}

export function numericValue(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

export function metersToKm(meters) {
  return Math.round((Number(meters) || 0) / 10) / 100;
}

export function timeMs(value) {
  if (value == null || value === '') return NaN;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct > 9999999999 ? direct : direct * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function round(value) {
  return Math.round(value * 10) / 10;
}

function routePointCandidateSets(activity) {
  const values = [
    activity.routePoints,
    activity.route?.points,
    activity.route?.locations,
    activity.route?.coordinates,
    activity.route?.path,
    activity.gps?.points,
    activity.gps?.samples,
    activity.gps?.locations,
    activity.gps?.path,
    activity.locations,
    activity.locationSamples,
    activity.samples,
    activity.path,
    activity.coordinates,
    activity.workoutRoute?.locations,
    activity.health?.route?.locations,
  ];
  const seen = new Set();
  return values.filter(value => {
    if (!Array.isArray(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeCandidatePoints(candidates) {
  const points = [];
  for (const candidate of candidates) {
    const point = normalizePoint(candidate, points.length);
    if (!point) continue;
    points.push({ ...point, index: points.length });
  }
  return points;
}

function betterRouteCandidate(candidate, current) {
  if (candidate.length !== current.length) return candidate.length > current.length;
  return rawRouteDistance(candidate) > rawRouteDistance(current);
}

function rawRouteDistance(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += distanceBetween(points[index - 1], points[index]);
  }
  return meters;
}

function normalizePoint(value, index) {
  if (!value) return null;
  if (Array.isArray(value)) return normalizeArrayPoint(value, index);
  if (typeof value !== 'object') return null;
  const lat = numericValue(value.lat, value.latitude, value.y);
  const lng = numericValue(value.lng, value.lon, value.long, value.longitude, value.x);
  const latE7 = numericValue(value.latE7, value.latitudeE7);
  const lngE7 = numericValue(value.lngE7, value.lonE7, value.longitudeE7);
  const point = {
    lat: Number.isFinite(lat) ? lat : latE7 / 10000000,
    lng: Number.isFinite(lng) ? lng : lngE7 / 10000000,
    altitude: numericValue(value.altitude, value.altitudeMeters, value.elevation),
    timestamp: value.timestamp || value.time || value.recordedAt || value.date || null,
    elapsedSeconds: numericValue(value.elapsedSeconds, value.elapsed, value.offsetSeconds, value.seconds),
    index,
  };
  return validPoint(point) ? point : null;
}

function normalizeArrayPoint(value, index) {
  if (value.length < 2) return null;
  const first = Number(value[0]);
  const second = Number(value[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const looksGeoJson = Math.abs(first) > 90 && Math.abs(second) <= 90;
  const point = {
    lat: looksGeoJson ? second : first,
    lng: looksGeoJson ? first : second,
    altitude: numericValue(value[2]),
    timestamp: value[3] || null,
    elapsedSeconds: numericValue(value[4]),
    index,
  };
  return validPoint(point) ? point : null;
}

function validPoint(point) {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90
    && Math.abs(point.lng) <= 180;
}

function withCumulativeDistance(points) {
  let cumulativeMeters = 0;
  return points.map((point, index) => {
    if (index > 0) cumulativeMeters += distanceBetween(points[index - 1], point);
    return { ...point, cumulativeMeters };
  });
}

function distanceBetween(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function toRad(value) {
  return value * Math.PI / 180;
}
