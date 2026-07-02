package com.aretenald.budget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class NativeIngestStore {
    static final String DEFAULT_API_URL = "https://budget-api-liart.vercel.app/api/ingest";

    private static final String PREFS = "budget_native_ingest";
    private static final String KEY_API_URL = "api_url";
    private static final String KEY_INGEST_TOKEN = "ingest_token";
    private static final String KEY_LOGS = "logs";
    private static final int MAX_LOGS = 40;

    private NativeIngestStore() {}

    static String getApiUrl(Context context) {
        String value = prefs(context).getString(KEY_API_URL, DEFAULT_API_URL);
        if (value == null || value.trim().length() == 0) return DEFAULT_API_URL;
        return value.trim();
    }

    static void setApiUrl(Context context, String apiUrl) {
        String value = apiUrl == null ? "" : apiUrl.trim();
        if (value.length() == 0) value = DEFAULT_API_URL;
        prefs(context).edit().putString(KEY_API_URL, value).apply();
    }

    static boolean hasToken(Context context) {
        String token = prefs(context).getString(KEY_INGEST_TOKEN, "");
        return token != null && token.trim().length() > 0;
    }

    static String getToken(Context context) {
        String token = prefs(context).getString(KEY_INGEST_TOKEN, "");
        return token == null ? "" : token.trim();
    }

    static void setToken(Context context, String token) {
        String value = token == null ? "" : token.trim();
        if (value.length() == 0) return;
        prefs(context).edit().putString(KEY_INGEST_TOKEN, value).apply();
    }

    static void clearToken(Context context) {
        prefs(context).edit().remove(KEY_INGEST_TOKEN).apply();
    }

    static synchronized void recordQueued(Context context, NativeIngestClient.NativePayload payload, String message) {
        upsert(context, payload.id, payload.toLogJson("queued", 0, message));
    }

    static synchronized void recordSent(Context context, NativeIngestClient.NativePayload payload, int httpStatus, String message) {
        upsert(context, payload.id, payload.toLogJson("sent", httpStatus, message));
    }

    static synchronized void recordFailed(Context context, NativeIngestClient.NativePayload payload, int httpStatus, String message) {
        JSONArray logs = readLogsArray(context);
        JSONObject existing = findLog(logs, payload.id);
        int attempts = existing == null ? 0 : existing.optInt("attempts", 0);
        JSONObject next = payload.toLogJson("failed", httpStatus, message);
        try {
            next.put("attempts", attempts + 1);
        } catch (JSONException ignored) {
        }
        upsert(context, payload.id, next);
    }

    static synchronized List<NativeIngestClient.NativePayload> pendingPayloads(Context context) {
        JSONArray logs = readLogsArray(context);
        List<NativeIngestClient.NativePayload> rows = new ArrayList<>();
        for (int i = 0; i < logs.length(); i++) {
            JSONObject row = logs.optJSONObject(i);
            if (row == null) continue;
            String status = row.optString("status", "");
            if (!"queued".equals(status) && !"failed".equals(status)) continue;
            JSONObject payloadJson = row.optJSONObject("payload");
            NativeIngestClient.NativePayload payload = NativeIngestClient.NativePayload.fromJson(payloadJson);
            if (payload != null) rows.add(payload);
        }
        return rows;
    }

    static synchronized String statusFor(Context context, String id) {
        JSONObject existing = findLog(readLogsArray(context), id);
        return existing == null ? "" : existing.optString("status", "");
    }

    static synchronized JSONArray readLogs(Context context) {
        return readLogsArray(context);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject findLog(JSONArray logs, String id) {
        if (id == null) return null;
        for (int i = 0; i < logs.length(); i++) {
            JSONObject row = logs.optJSONObject(i);
            if (row != null && id.equals(row.optString("id"))) return row;
        }
        return null;
    }

    private static void upsert(Context context, String id, JSONObject next) {
        JSONArray logs = readLogsArray(context);
        JSONArray compact = new JSONArray();
        compact.put(next);
        for (int i = 0; i < logs.length() && compact.length() < MAX_LOGS; i++) {
            JSONObject row = logs.optJSONObject(i);
            if (row == null) continue;
            if (id != null && id.equals(row.optString("id"))) continue;
            compact.put(row);
        }
        prefs(context).edit().putString(KEY_LOGS, compact.toString()).apply();
    }

    private static JSONArray readLogsArray(Context context) {
        String raw = prefs(context).getString(KEY_LOGS, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException err) {
            return new JSONArray();
        }
    }
}
