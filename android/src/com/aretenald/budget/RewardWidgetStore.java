package com.aretenald.budget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

final class RewardWidgetStore {
    private static final String PREFS = "budget_reward_widget_store";
    private static final String KEY_SNAPSHOT = "reward_snapshot";
    private static final int SNAPSHOT_SCHEMA_VERSION = 2;
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
        // 스키마 v2 유지. safeToSpend/funds는 추가 필드로 있으면 저장(종합 위젯 렌더링용).
        JSONObject out = new JSONObject();
        out.put("schemaVersion", SNAPSHOT_SCHEMA_VERSION);
        out.put("updatedAt", safe(source.optString("updatedAt", "")));
        out.put("storedAt", System.currentTimeMillis());
        out.put("baselineReady", source.optBoolean("baselineReady", false));
        out.put("todaySaved", nonNegative(source.optLong("todaySaved", 0)));
        out.put("todaySpend", nonNegative(source.optLong("todaySpend", 0)));
        out.put("dailyBaseline", nonNegative(source.optLong("dailyBaseline", 0)));
        out.put("ruleBonusPoints", nonNegative(source.optLong("ruleBonusPoints", 0)));
        out.put("dailyReward", normalizeDailyReward(source.optJSONObject("dailyReward")));
        out.put("pointBuckets", normalizePointBuckets(source.optJSONArray("pointBuckets")));
        JSONObject safeToSpend = normalizeSafeToSpend(source.optJSONObject("safeToSpend"));
        if (safeToSpend != null) out.put("safeToSpend", safeToSpend);
        out.put("funds", normalizeFunds(source.optJSONArray("funds")));
        return out;
    }

    private static JSONObject normalizeSafeToSpend(JSONObject source) throws Exception {
        if (source == null) return null;
        JSONObject out = new JSONObject();
        out.put("amount", source.optLong("amount", 0));
        out.put("perDay", nonNegative(source.optLong("perDay", 0)));
        out.put("daysRemaining", nonNegative(source.optLong("daysRemaining", 0)));
        out.put("spentRatio", clampRate(source.optDouble("spentRatio", 0)));
        out.put("negative", source.optBoolean("negative", source.optLong("amount", 0) < 0));
        out.put("periodLabel", safe(source.optString("periodLabel", "")));
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

    private static JSONObject normalizeDailyReward(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        if (source == null) return out;
        out.put("status", safe(source.optString("status", "")));
        out.put("label", safe(source.optString("label", "")));
        out.put("focusBucketKey", safe(source.optString("focusBucketKey", "")));
        out.put("selectedDateKey", safe(source.optString("selectedDateKey", "")));
        out.put("ruleBonusPoints", nonNegative(source.optLong("ruleBonusPoints", 0)));
        out.put("bonusText", safe(source.optString("bonusText", "")));
        out.put("nextStepText", safe(source.optString("nextStepText", "")));
        out.put("freezeText", safe(source.optString("freezeText", "")));
        out.put("streakText", safe(source.optString("streakText", "")));
        out.put("tierLabel", safe(source.optString("tierLabel", "")));
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
