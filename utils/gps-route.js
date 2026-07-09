import {
  metersToKm,
  normalizeRoutePoints,
  numericValue,
  pad2,
  routeBounds,
  routeDistance,
  round,
  timeMs,
} from './gps-route-core.js?v=20260710-gps-route-rewrite';

export function normalizeRunActivityRoute(activity = {}) {
  const points = normalizeRoutePoints(activity);
  const routeDistanceMeters = routeDistance(points);
  const explicitDistanceMeters = explicitDistance(activity);
  const distanceMeters = explicitDistanceMeters > 0 ? explicitDistanceMeters : routeDistanceMeters;
  const durationSeconds = explicitDurationSeconds(activity, points);
  const bounds = routeBounds(points);
  return {
    points,
    startPoint: points[0] || null,
    endPoint: points[points.length - 1] || null,
    bounds,
    distanceMeters,
    distanceKm: metersToKm(distanceMeters),
    routeDistanceMeters,
    durationSeconds,
    paceSecondsPerKm: distanceMeters > 0 && durationSeconds > 0
      ? durationSeconds / (distanceMeters / 1000)
      : null,
    kilometerMarkers: kilometerMarkers(points),
  };
}

export function normalizeRunActivitySummary(activity = {}) {
  const route = normalizeRunActivityRoute(activity);
  return {
    id: activity.id || '',
    title: activity.title || activity.name || activity.activityName || '러닝',
    source: activity.source || activity.deviceSource || activity.provider || '',
    startedAt: activity.startedAt || activity.startTime || activity.startDate || activity.createdAt || null,
    distanceKm: route.distanceKm,
    durationSeconds: route.durationSeconds,
    calories: numericValue(activity.calories, activity.caloriesKcal, activity.metrics?.caloriesKcal, activity.summary?.calories),
    averageHeartRate: numericValue(activity.averageHeartRate, activity.avgHeartRate, activity.averageBpm, activity.metrics?.averageHeartRate, activity.heartRate?.average),
    cadence: numericValue(activity.cadence, activity.cadenceSpm, activity.averageCadence, activity.averageCadenceSpm, activity.metrics?.cadence, activity.metrics?.averageCadence, activity.runningCadence?.average, activity.runningCadence?.avg),
    elevationGainMeters: numericValue(activity.elevationGainMeters, activity.elevationGain, activity.metrics?.elevationGainMeters),
    route,
  };
}

export function formatRunDistanceKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}

export function formatRunDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

export function formatRunPace(secondsPerKm) {
  const n = Math.round(Number(secondsPerKm) || 0);
  if (n <= 0) return `--'--"`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}'${pad2(s)}"`;
}

export function projectRunRoute(route, size = {}) {
  const points = Array.isArray(route?.points) ? route.points : [];
  const width = Math.max(1, Number(size.width) || 320);
  const height = Math.max(1, Number(size.height) || 360);
  const padding = Math.max(0, Number(size.padding) || 26);
  const bounds = route?.bounds || routeBounds(points);
  const latSpan = Math.max(0.0001, bounds.maxLat - bounds.minLat);
  const lngSpan = Math.max(0.0001, bounds.maxLng - bounds.minLng);
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(innerWidth / lngSpan, innerHeight / latSpan);
  const routeWidth = lngSpan * scale;
  const routeHeight = latSpan * scale;
  const xOffset = (width - routeWidth) / 2;
  const yOffset = (height - routeHeight) / 2;

  const projected = points.map(point => ({
    ...point,
    x: xOffset + (point.lng - bounds.minLng) * scale,
    y: yOffset + (bounds.maxLat - point.lat) * scale,
  }));
  const projectedMarkers = (route?.kilometerMarkers || []).map(marker => ({
    ...marker,
    x: xOffset + (marker.lng - bounds.minLng) * scale,
    y: yOffset + (bounds.maxLat - marker.lat) * scale,
  }));
  return {
    points: projected,
    kilometerMarkers: projectedMarkers,
    polyline: projected.map(point => `${round(point.x)},${round(point.y)}`).join(' '),
    startPoint: projected[0] || null,
    endPoint: projected[projected.length - 1] || null,
  };
}

function kilometerMarkers(points) {
  const total = routeDistance(points);
  const markers = [];
  for (let target = 1000; target < total; target += 1000) {
    const point = interpolateAtDistance(points, target);
    if (point) markers.push({ ...point, km: target / 1000 });
  }
  return markers;
}

function interpolateAtDistance(points, targetMeters) {
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (next.cumulativeMeters < targetMeters) continue;
    const span = Math.max(1, next.cumulativeMeters - prev.cumulativeMeters);
    const ratio = Math.min(1, Math.max(0, (targetMeters - prev.cumulativeMeters) / span));
    return {
      lat: prev.lat + (next.lat - prev.lat) * ratio,
      lng: prev.lng + (next.lng - prev.lng) * ratio,
      cumulativeMeters: targetMeters,
    };
  }
  return null;
}

function explicitDistance(activity) {
  const meters = numericValue(activity.distanceMeters, activity.distanceInMeters, activity.totalDistanceMeters, activity.metrics?.distanceMeters, activity.summary?.distanceMeters);
  if (Number.isFinite(meters) && meters > 0) return meters;
  const km = numericValue(activity.distanceKm, activity.kilometers, activity.metrics?.distanceKm, activity.summary?.distanceKm);
  return Number.isFinite(km) && km > 0 ? km * 1000 : 0;
}

function explicitDurationSeconds(activity, points = []) {
  const seconds = numericValue(activity.durationSeconds, activity.elapsedSeconds, activity.elapsedTimeSeconds, activity.movingTimeSeconds, activity.totalTimeSeconds, activity.metrics?.durationSeconds, activity.summary?.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const millis = numericValue(activity.durationMs, activity.elapsedMs, activity.metrics?.durationMs, activity.summary?.durationMs);
  if (Number.isFinite(millis) && millis > 0) return millis / 1000;
  const startedAt = timeMs(activity.startedAt || activity.startTime || activity.startDate || activity.beginTime);
  const endedAt = timeMs(activity.endedAt || activity.endTime || activity.endDate || activity.finishedAt || activity.completedAt);
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
    return (endedAt - startedAt) / 1000;
  }
  const firstPointTime = timeMs(points[0]?.timestamp);
  const lastPointTime = timeMs(points[points.length - 1]?.timestamp);
  const firstElapsed = points[0]?.elapsedSeconds;
  const lastElapsed = points[points.length - 1]?.elapsedSeconds;
  if (Number.isFinite(firstElapsed) && Number.isFinite(lastElapsed) && lastElapsed > firstElapsed) {
    return lastElapsed - firstElapsed;
  }
  return Number.isFinite(firstPointTime) && Number.isFinite(lastPointTime) && lastPointTime > firstPointTime
    ? (lastPointTime - firstPointTime) / 1000
    : 0;
}
