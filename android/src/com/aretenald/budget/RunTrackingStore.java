package com.aretenald.budget;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;

import org.json.JSONArray;
import org.json.JSONObject;

final class RunTrackingStore {
    private static final String PREFS = "budget_native_run_tracking";
    private static final String KEY_STATE = "state";
    private static final String KEY_STARTED_AT = "started_at";
    private static final String KEY_PAUSED_AT = "paused_at";
    private static final String KEY_PAUSED_MS = "paused_ms";
    private static final String KEY_DISTANCE_METERS = "distance_meters";
    private static final String KEY_SAMPLES = "samples";
    private static final String KEY_MESSAGE = "message";
    private static final int MAX_SAMPLES = 12000;

    private RunTrackingStore() {}

    static synchronized void start(Context context) {
        prefs(context).edit()
            .putString(KEY_STATE, "recording")
            .putLong(KEY_STARTED_AT, System.currentTimeMillis())
            .putLong(KEY_PAUSED_AT, 0)
            .putLong(KEY_PAUSED_MS, 0)
            .putFloat(KEY_DISTANCE_METERS, 0f)
            .putString(KEY_SAMPLES, "[]")
            .putString(KEY_MESSAGE, "GPS 신호를 찾는 중…")
            .apply();
    }

    static synchronized boolean append(Context context, Location location) {
        if (location == null || !"recording".equals(state(context))) return false;
        if (location.hasAccuracy() && location.getAccuracy() > 80f) {
            setMessage(context, "GPS 정확도 개선 중 (±" + Math.round(location.getAccuracy()) + "m)");
            return false;
        }
        try {
            JSONArray samples = samples(context);
            if (samples.length() >= MAX_SAMPLES) {
                setMessage(context, "최대 기록 지점에 도달했습니다. 러닝을 종료해 저장해주세요.");
                return false;
            }
            JSONObject previous = samples.length() > 0 ? samples.optJSONObject(samples.length() - 1) : null;
            long timestamp = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
            double addedMeters = 0;
            if (previous != null) {
                long previousTime = previous.optLong("timestamp", timestamp);
                if (timestamp - previousTime < 900) return false;
                addedMeters = distanceMeters(
                    previous.optDouble("lat"), previous.optDouble("lng"),
                    location.getLatitude(), location.getLongitude()
                );
                double seconds = Math.max(0.001, (timestamp - previousTime) / 1000.0);
                if (addedMeters / seconds > 13.0) {
                    setMessage(context, "비정상 GPS 이동을 제외했습니다.");
                    return false;
                }
            }
            JSONObject point = new JSONObject();
            point.put("lat", location.getLatitude());
            point.put("lng", location.getLongitude());
            if (location.hasAltitude()) point.put("altitude", location.getAltitude());
            if (location.hasAccuracy()) point.put("accuracy", location.getAccuracy());
            point.put("timestamp", timestamp);
            point.put("elapsedSeconds", activeDurationSeconds(context));
            samples.put(point);
            float total = prefs(context).getFloat(KEY_DISTANCE_METERS, 0f) + (float) addedMeters;
            prefs(context).edit()
                .putString(KEY_SAMPLES, samples.toString())
                .putFloat(KEY_DISTANCE_METERS, total)
                .putString(KEY_MESSAGE, location.hasAccuracy() && location.getAccuracy() > 30f
                    ? "GPS 정확도 ±" + Math.round(location.getAccuracy()) + "m"
                    : "")
                .apply();
            return true;
        } catch (Exception err) {
            setMessage(context, "GPS 기록 저장 중 오류가 발생했습니다.");
            return false;
        }
    }

    static synchronized void pause(Context context) {
        if (!"recording".equals(state(context))) return;
        prefs(context).edit()
            .putString(KEY_STATE, "paused")
            .putLong(KEY_PAUSED_AT, System.currentTimeMillis())
            .putString(KEY_MESSAGE, "일시정지됨")
            .apply();
    }

    static synchronized void resume(Context context) {
        if (!"paused".equals(state(context))) return;
        SharedPreferences values = prefs(context);
        long pausedAt = values.getLong(KEY_PAUSED_AT, 0);
        long pausedMs = values.getLong(KEY_PAUSED_MS, 0);
        if (pausedAt > 0) pausedMs += Math.max(0, System.currentTimeMillis() - pausedAt);
        values.edit()
            .putString(KEY_STATE, "recording")
            .putLong(KEY_PAUSED_AT, 0)
            .putLong(KEY_PAUSED_MS, pausedMs)
            .putString(KEY_MESSAGE, "")
            .apply();
    }

    static synchronized boolean finish(Context context) {
        SharedPreferences values = prefs(context);
        String current = state(context);
        if (!"recording".equals(current) && !"paused".equals(current)) return false;
        try {
            if ("paused".equals(current)) resume(context);
            JSONArray points = samples(context);
            if (points.length() < 2) {
                values.edit().putString(KEY_STATE, "paused").putString(KEY_MESSAGE, "저장할 GPS 좌표가 부족합니다.").apply();
                return false;
            }
            long startedAt = values.getLong(KEY_STARTED_AT, System.currentTimeMillis());
            long endedAt = System.currentTimeMillis();
            JSONObject gps = new JSONObject();
            gps.put("samples", points);
            JSONObject activity = new JSONObject();
            activity.put("title", "APK 러닝");
            activity.put("source", "android_native_gps");
            activity.put("startedAt", startedAt);
            activity.put("endedAt", endedAt);
            activity.put("durationSeconds", activeDurationSeconds(context));
            activity.put("distanceMeters", values.getFloat(KEY_DISTANCE_METERS, 0f));
            activity.put("gps", gps);
            boolean queued = RunActivityImportStore.enqueueRecordedActivity(context, activity);
            values.edit()
                .putString(KEY_STATE, "idle")
                .putLong(KEY_STARTED_AT, 0)
                .putLong(KEY_PAUSED_AT, 0)
                .putLong(KEY_PAUSED_MS, 0)
                .putFloat(KEY_DISTANCE_METERS, 0f)
                .putString(KEY_SAMPLES, "[]")
                .putString(KEY_MESSAGE, queued ? "러닝 저장 대기 중" : "러닝 저장에 실패했습니다.")
                .apply();
            return queued;
        } catch (Exception err) {
            values.edit().putString(KEY_MESSAGE, "러닝 저장에 실패했습니다.").apply();
            return false;
        }
    }

    static synchronized void cancel(Context context) {
        prefs(context).edit().clear().apply();
    }

    static synchronized String statusJson(Context context, boolean permissionGranted) {
        SharedPreferences values = prefs(context);
        JSONObject out = new JSONObject();
        try {
            out.put("available", true);
            out.put("permissionGranted", permissionGranted);
            out.put("state", state(context));
            out.put("startedAt", values.getLong(KEY_STARTED_AT, 0));
            out.put("durationSeconds", activeDurationSeconds(context));
            out.put("distanceMeters", values.getFloat(KEY_DISTANCE_METERS, 0f));
            out.put("pointCount", samples(context).length());
            out.put("message", values.getString(KEY_MESSAGE, ""));
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    static String state(Context context) {
        return prefs(context).getString(KEY_STATE, "idle");
    }

    static long activeDurationSeconds(Context context) {
        SharedPreferences values = prefs(context);
        long startedAt = values.getLong(KEY_STARTED_AT, 0);
        if (startedAt <= 0) return 0;
        long end = "paused".equals(state(context)) && values.getLong(KEY_PAUSED_AT, 0) > 0
            ? values.getLong(KEY_PAUSED_AT, 0)
            : System.currentTimeMillis();
        return Math.max(0, (end - startedAt - values.getLong(KEY_PAUSED_MS, 0)) / 1000);
    }

    static float distance(Context context) {
        return prefs(context).getFloat(KEY_DISTANCE_METERS, 0f);
    }

    private static JSONArray samples(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_SAMPLES, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void setMessage(Context context, String message) {
        prefs(context).edit().putString(KEY_MESSAGE, message).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 12742017.6 * Math.asin(Math.sqrt(a));
    }
}
