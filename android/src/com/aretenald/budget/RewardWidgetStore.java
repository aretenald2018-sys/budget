package com.aretenald.budget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

final class RewardWidgetStore {
    private static final String PREFS = "budget_reward_widget_store";
    private static final String KEY_SNAPSHOT = "reward_snapshot";
    private static final int SNAPSHOT_SCHEMA_VERSION = 3;
    private static final int MAX_WIDGET_POINT_BUCKETS = 4;
    private static final int MAX_WIDGET_FUNDS = 4;

    private RewardWidgetStore() {}

    static synchronized boolean saveSnapshot(Context context, String rawJson) {
        try {
            JSONObject snapshot = normalizeSnapshot(rawJson);
            prefs(context).edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply();
            RewardWidgetProvider.updateAll(context);
            return true;
        } catch (Exception err) {
            NotificationCaptureStore.recordError(
                context,
                "reward_widget_snapshot_failed",
                err.getClass().getSimpleName() + ": " + safe(err.getMessage())
            );
            return false;
        }
    }

    static synchronized String snapshotJson(Context context) {
        return prefs(context).getString(KEY_SNAPSHOT, "{}");
    }

    private static JSONObject normalizeSnapshot(String rawJson) throws Exception {
        JSONObject source = new JSONObject(rawJson == null ? "{}" : rawJson);
        int schemaVersion = source.optInt("schemaVersion", SNAPSHOT_SCHEMA_VERSION);
        if (schemaVersion != SNAPSHOT_SCHEMA_VERSION) {
            throw new IllegalArgumentException("unsupported reward widget schemaVersion: " + schemaVersion);
        }
        // 스키마 v3: 히어로가 '써도 되는 돈', 보조가 '적립한 포인트'.
        // 렌더되지 않던 '오늘 카드'(dailyReward)는 v3에서 사라졌다.
        JSONObject out = new JSONObject();
        out.put("schemaVersion", SNAPSHOT_SCHEMA_VERSION);
        out.put("updatedAt", safe(source.optString("updatedAt", "")));
        out.put("storedAt", System.currentTimeMillis());
        out.put("baselineReady", source.optBoolean("baselineReady", false));
        out.put("todaySaved", nonNegative(source.optLong("todaySaved", 0)));
        out.put("todaySpend", nonNegative(source.optLong("todaySpend", 0)));
        out.put("dailyBaseline", nonNegative(source.optLong("dailyBaseline", 0)));
        out.put("ruleBonusPoints", nonNegative(source.optLong("ruleBonusPoints", 0)));
        out.put("pointBuckets", normalizePointBuckets(source.optJSONArray("pointBuckets")));
        out.put("points", normalizePointTotals(source.optJSONObject("points")));
        out.put("safeToSpend", normalizeSafeToSpend(source.optJSONObject("safeToSpend")));
        out.put("funds", normalizeFunds(source.optJSONArray("funds")));
        return out;
    }

    // 히어로 블록은 항상 존재한다(값이 없으면 0). ready=false 면 위젯이 '앱을 열어 갱신'을 띄운다.
    private static JSONObject normalizeSafeToSpend(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        if (source == null) {
            out.put("amount", 0);
            out.put("perDay", 0);
            out.put("daysRemaining", 0);
            out.put("spentRatio", 0);
            out.put("negative", false);
            out.put("periodLabel", "");
            out.put("weekDays", 0);
            out.put("weekAmount", 0);
            out.put("ready", false);
            return out;
        }
        out.put("amount", source.optLong("amount", 0));
        out.put("perDay", nonNegative(source.optLong("perDay", 0)));
        out.put("daysRemaining", nonNegative(source.optLong("daysRemaining", 0)));
        out.put("spentRatio", clampRate(source.optDouble("spentRatio", 0)));
        out.put("negative", source.optBoolean("negative", source.optLong("amount", 0) < 0));
        out.put("periodLabel", safe(source.optString("periodLabel", "")));
        out.put("weekDays", nonNegative(source.optLong("weekDays", 0)));
        out.put("weekAmount", source.optLong("weekAmount", 0));
        out.put("ready", source.optBoolean("ready", true));
        return out;
    }

    // 버킷 합계(적립한 포인트). 위젯 보조 블록이 이 값을 그대로 쓴다.
    private static JSONObject normalizePointTotals(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        out.put("todayPoints", source == null ? 0 : nonNegative(source.optLong("todayPoints", 0)));
        out.put("monthPoints", source == null ? 0 : source.optLong("monthPoints", 0));
        out.put("earnedMonthPoints", source == null ? 0 : nonNegative(source.optLong("earnedMonthPoints", 0)));
        out.put("spentMonthPoints", source == null ? 0 : nonNegative(source.optLong("spentMonthPoints", 0)));
        out.put("projectedMonthPoints", source == null ? 0 : nonNegative(source.optLong("projectedMonthPoints", 0)));
        return out;
    }

    private static JSONArray normalizeFunds(JSONArray source) throws Exception {
        JSONArray out = new JSONArray();
        if (source == null) return out;
        for (int i = 0; i < source.length() && out.length() < MAX_WIDGET_FUNDS; i++) {
            JSONObject row = source.optJSONObject(i);
            if (row == null) continue;
            JSONObject clean = new JSONObject();
            clean.put("emoji", safe(row.optString("emoji", "")));
            clean.put("label", safe(row.optString("label", "")));
            clean.put("balance", row.optLong("balance", 0));
            clean.put("overdrawn", row.optBoolean("overdrawn", row.optLong("balance", 0) < 0));
            out.put(clean);
        }
        return out;
    }

    private static JSONArray normalizePointBuckets(JSONArray source) throws Exception {
        JSONArray out = new JSONArray();
        if (source == null) return out;
        for (int i = 0; i < source.length() && out.length() < MAX_WIDGET_POINT_BUCKETS; i++) {
            JSONObject row = source.optJSONObject(i);
            if (row == null) continue;
            JSONObject clean = new JSONObject();
            clean.put("key", safe(row.optString("key", "")));
            clean.put("label", safe(row.optString("label", "")));
            clean.put("rate", clampRate(row.optDouble("rate", 0)));
            clean.put("targetAmount", nonNegative(row.optLong("targetAmount", 0)));
            clean.put("todayBasePoints", nonNegative(row.optLong("todayBasePoints", 0)));
            clean.put("todayBonusPoints", nonNegative(row.optLong("todayBonusPoints", 0)));
            clean.put("todayPoints", nonNegative(row.optLong("todayPoints", 0)));
            clean.put("earnedMonthPoints", nonNegative(row.optLong("earnedMonthPoints", Math.max(0, row.optLong("monthPoints", 0)))));
            clean.put("spentMonthPoints", nonNegative(row.optLong("spentMonthPoints", 0)));
            clean.put("monthPoints", row.optLong("monthPoints", 0));
            clean.put("projectedMonthPoints", nonNegative(row.optLong("projectedMonthPoints", 0)));
            out.put(clean);
        }
        return out;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static long nonNegative(long value) {
        return Math.max(0, value);
    }

    private static double clampRate(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
