package com.aretenald.budget;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

final class NotificationCaptureStore {
    private static final String PREFS = "budget_notification_capture_store";
    private static final String KEY_CAPTURES = "captures";
    private static final int MAX_ROWS = 200;

    private NotificationCaptureStore() {}

    static synchronized boolean enqueue(Context context, JSONObject capture) {
        try {
            JSONArray rows = readRows(context);
            String id = capture.optString("id");
            int existing = indexOf(rows, id);
            if (existing >= 0) {
                JSONObject existingRow = rows.optJSONObject(existing);
                String existingStatus = existingRow == null ? "" : existingRow.optString("status", "");
                if ("saved".equals(existingStatus) || "duplicate".equals(existingStatus) || "merged".equals(existingStatus)) {
                    return false;
                }
            }
            capture.put("status", "queued");
            capture.put("attempts", existing >= 0 ? rows.optJSONObject(existing).optInt("attempts", 0) : 0);
            capture.put("updatedAt", System.currentTimeMillis());
            if (existing >= 0) {
                rows.put(existing, capture);
            } else {
                rows.put(capture);
            }
            writeRows(context, trimRows(rows));
            return true;
        } catch (Exception err) {
            recordError(context, "enqueue_failed", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
            return false;
        }
    }

    static synchronized String listPendingJson(Context context, int max) {
        JSONArray out = new JSONArray();
        JSONArray rows = readRows(context);
        int limit = Math.max(1, Math.min(max, 50));
        for (int i = 0; i < rows.length() && out.length() < limit; i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String status = row.optString("status", "queued");
            int attempts = row.optInt("attempts", 0);
            if ("queued".equals(status) || ("failed".equals(status) && attempts < 3)) {
                out.put(row);
            }
        }
        return out.toString();
    }

    static synchronized void ack(Context context, String id, String txId, String action) {
        JSONArray rows = readRows(context);
        int idx = indexOf(rows, id);
        if (idx < 0) return;
        JSONObject row = rows.optJSONObject(idx);
        if (row == null) return;
        try {
            row.put("status", action == null || action.length() == 0 ? "saved" : action);
            row.put("txId", safe(txId));
            row.put("ackedAt", System.currentTimeMillis());
            row.put("updatedAt", System.currentTimeMillis());
            rows.put(idx, row);
            writeRows(context, trimRows(rows));
        } catch (Exception ignored) {
        }
    }

    static synchronized void fail(Context context, String id, String message) {
        JSONArray rows = readRows(context);
        int idx = indexOf(rows, id);
        if (idx < 0) return;
        JSONObject row = rows.optJSONObject(idx);
        if (row == null) return;
        try {
            row.put("status", "failed");
            row.put("attempts", row.optInt("attempts", 0) + 1);
            row.put("lastError", safe(message));
            row.put("updatedAt", System.currentTimeMillis());
            rows.put(idx, row);
            writeRows(context, trimRows(rows));
        } catch (Exception ignored) {
        }
    }

    static synchronized String statusJson(Context context) {
        JSONArray rows = readRows(context);
        int queued = 0;
        int failed = 0;
        int saved = 0;
        JSONArray recent = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String status = row.optString("status", "queued");
            if ("queued".equals(status)) queued++;
            else if ("failed".equals(status)) failed++;
            else if ("saved".equals(status) || "duplicate".equals(status) || "merged".equals(status)) saved++;
            if (recent.length() < 12) recent.put(row);
        }
        JSONObject out = new JSONObject();
        try {
            out.put("available", true);
            out.put("notificationAccessEnabled", isNotificationAccessEnabled(context));
            out.put("queued", queued);
            out.put("failed", failed);
            out.put("saved", saved);
            out.put("recent", recent);
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    static synchronized void recordInfo(Context context, String event, String message) {
        recordLog(context, event, message, "info");
    }

    static synchronized void recordError(Context context, String event, String message) {
        recordLog(context, event, message, "error");
    }

    static synchronized void recordIgnored(Context context, String event, String message) {
        recordLog(context, event, message, "ignored");
    }

    private static void recordLog(Context context, String event, String message, String level) {
        try {
            JSONObject row = new JSONObject();
            row.put("id", "log_" + System.currentTimeMillis() + "_" + Math.abs((event + message).hashCode()));
            row.put("schemaVersion", 1);
            row.put("status", level);
            row.put("event", event);
            row.put("message", safe(message));
            row.put("capturedAt", System.currentTimeMillis());
            JSONArray rows = readRows(context);
            rows.put(row);
            writeRows(context, trimRows(rows));
        } catch (Exception ignored) {
        }
    }

    private static boolean isNotificationAccessEnabled(Context context) {
        String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.length() == 0) return false;
        ComponentName component = new ComponentName(context, BudgetNotificationService.class);
        String haystack = flat.toLowerCase(Locale.ROOT);
        String full = component.flattenToString().toLowerCase(Locale.ROOT);
        String shortName = component.flattenToShortString().toLowerCase(Locale.ROOT);
        String packageName = context.getPackageName().toLowerCase(Locale.ROOT);
        String className = BudgetNotificationService.class.getName().toLowerCase(Locale.ROOT);
        return haystack.contains(full)
            || haystack.contains(shortName)
            || (haystack.contains(packageName) && haystack.contains(className));
    }

    private static JSONArray readRows(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_CAPTURES, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void writeRows(Context context, JSONArray rows) {
        prefs(context).edit().putString(KEY_CAPTURES, rows.toString()).apply();
    }

    private static JSONArray trimRows(JSONArray rows) {
        JSONArray out = new JSONArray();
        int start = Math.max(0, rows.length() - MAX_ROWS);
        for (int i = rows.length() - 1; i >= start; i--) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) out.put(row);
        }
        return out;
    }

    private static int indexOf(JSONArray rows, String id) {
        if (id == null || id.length() == 0) return -1;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && id.equals(row.optString("id"))) return i;
        }
        return -1;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
