package com.aretenald.budget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

final class BudgetMetricWidgetStore {
    private static final String PREFS = "budget_metric_widget_store";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final int SCHEMA_VERSION = 1;

    private BudgetMetricWidgetStore() {}

    static synchronized boolean saveSnapshot(Context context, String rawJson) {
        try {
            JSONObject snapshot = normalizeSnapshot(rawJson);
            prefs(context).edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply();
            SpendingWidgetProvider.updateAll(context);
            PointsWidgetProvider.updateAll(context);
            WineNoteWidgetProvider.updateAll(context);
            return true;
        } catch (Exception error) {
            NotificationCaptureStore.recordError(
                context,
                "budget_metric_widget_snapshot_failed",
                error.getClass().getSimpleName() + ": " + safe(error.getMessage())
            );
            return false;
        }
    }

    static String snapshotJson(Context context) {
        return prefs(context).getString(KEY_SNAPSHOT, "{}");
    }

    private static JSONObject normalizeSnapshot(String rawJson) throws Exception {
        JSONObject source = new JSONObject(rawJson == null ? "{}" : rawJson);
        if (source.optInt("schemaVersion", 0) != SCHEMA_VERSION) {
            throw new IllegalArgumentException("unsupported budget metric widget schemaVersion");
        }
        JSONObject out = new JSONObject();
        out.put("schemaVersion", SCHEMA_VERSION);
        out.put("updatedAt", safe(source.optString("updatedAt", "")));
        out.put("storedAt", System.currentTimeMillis());
        out.put("state", safe(source.optString("state", "ready")));
        out.put("spending", normalizeSpending(source.optJSONObject("spending")));
        out.put("points", normalizePoints(source.optJSONObject("points")));
        out.put("wine", normalizeWine(source.optJSONObject("wine")));
        return out;
    }

    private static JSONObject normalizeSpending(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        if (source == null) return out;
        out.put("monthKey", safe(source.optString("monthKey", "")));
        out.put("monthSpent", nonNegative(source.optLong("monthSpent", 0)));
        out.put("monthTarget", nonNegative(source.optLong("monthTarget", 0)));
        out.put("progress", clampPercent(source.optInt("progress", 0)));
        out.put("twoWeekSpent", nonNegative(source.optLong("twoWeekSpent", 0)));
        out.put("twoWeekPrevious", nonNegative(source.optLong("twoWeekPrevious", 0)));
        out.put("twoWeekDeltaPct", source.isNull("twoWeekDeltaPct") ? JSONObject.NULL : source.optDouble("twoWeekDeltaPct", 0));
        JSONArray trend = new JSONArray();
        JSONArray sourceTrend = source.optJSONArray("trend");
        if (sourceTrend != null) {
            for (int index = 0; index < sourceTrend.length() && index < 6; index++) {
                JSONObject row = sourceTrend.optJSONObject(index);
                if (row == null) continue;
                JSONObject clean = new JSONObject();
                clean.put("label", safe(row.optString("label", "")));
                clean.put("amount", nonNegative(row.optLong("amount", 0)));
                trend.put(clean);
            }
        }
        out.put("trend", trend);
        return out;
    }

    private static JSONObject normalizePoints(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        if (source == null) return out;
        out.put("balance", source.optLong("balance", 0));
        out.put("monthPoints", source.optLong("monthPoints", 0));
        out.put("todayPoints", nonNegative(source.optLong("todayPoints", 0)));
        out.put("focusLabel", safe(source.optString("focusLabel", "포인트")));
        return out;
    }

    private static JSONObject normalizeWine(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        if (source == null) return out;
        out.put("state", safe(source.optString("state", "empty")));
        out.put("name", safe(source.optString("name", "")));
        out.put("note", safe(source.optString("note", "")).substring(0, Math.min(160, safe(source.optString("note", "")).length())));
        out.put("rating", source.isNull("rating") ? JSONObject.NULL : source.optDouble("rating", 0));
        out.put("tastedAt", safe(source.optString("tastedAt", "")));
        return out;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static long nonNegative(long value) { return Math.max(0, value); }

    private static int clampPercent(int value) { return Math.max(0, Math.min(100, value)); }

    private static String safe(String value) { return value == null ? "" : value; }
}
