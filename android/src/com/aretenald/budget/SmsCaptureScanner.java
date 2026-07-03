package com.aretenald.budget;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

final class SmsCaptureScanner {
    private static final String TAG = "BudgetSmsScan";
    private static final int REQUEST_READ_SMS = 8108;
    private static final Uri SMS_INBOX_URI = Uri.parse("content://sms/inbox");

    private SmsCaptureScanner() {}

    static boolean hasReadPermission(Context context) {
        if (Build.VERSION.SDK_INT < 23) return true;
        return context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    static void requestReadPermission(Activity activity) {
        if (hasReadPermission(activity) || Build.VERSION.SDK_INT < 23) return;
        activity.requestPermissions(new String[] { Manifest.permission.READ_SMS }, REQUEST_READ_SMS);
    }

    static boolean isReadPermissionRequest(int requestCode) {
        return requestCode == REQUEST_READ_SMS;
    }

    static String scanRecentJson(Context context, int max, int lookbackMinutes) {
        JSONObject out = new JSONObject();
        try {
            ScanResult result = scanRecent(context, max, lookbackMinutes);
            out.put("available", true);
            out.put("permissionGranted", result.permissionGranted);
            out.put("scanned", result.scanned);
            out.put("queued", result.queued);
            out.put("ignored", result.ignored);
            out.put("failed", result.failed);
        } catch (Exception err) {
            try {
                out.put("available", true);
                out.put("permissionGranted", hasReadPermission(context));
                out.put("error", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    static ScanResult scanRecent(Context context, int max, int lookbackMinutes) {
        ScanResult result = new ScanResult();
        result.permissionGranted = hasReadPermission(context);
        if (!result.permissionGranted) {
            Log.i(TAG, "scan_denied missing READ_SMS");
            return result;
        }

        int limit = Math.max(1, Math.min(max, 80));
        long lookbackMs = Math.max(10L, Math.min(lookbackMinutes, 7 * 24 * 60)) * 60L * 1000L;
        long cutoff = System.currentTimeMillis() - lookbackMs;
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                SMS_INBOX_URI,
                new String[] { "_id", "address", "body", "date" },
                "date >= ?",
                new String[] { String.valueOf(cutoff) },
                "date DESC"
            );
            if (cursor == null) return result;
            int idColumn = cursor.getColumnIndex("_id");
            int addressColumn = cursor.getColumnIndex("address");
            int bodyColumn = cursor.getColumnIndex("body");
            int dateColumn = cursor.getColumnIndex("date");
            while (cursor.moveToNext() && result.scanned < limit) {
                result.scanned++;
                long id = idColumn >= 0 ? cursor.getLong(idColumn) : result.scanned;
                String address = addressColumn >= 0 ? cursor.getString(addressColumn) : "";
                String body = bodyColumn >= 0 ? cursor.getString(bodyColumn) : "";
                long date = dateColumn >= 0 ? cursor.getLong(dateColumn) : System.currentTimeMillis();
                try {
                    JSONObject capture = PaymentNotificationParser.parseSms(context, id, safe(address), safe(body), date);
                    if (capture == null) {
                        result.ignored++;
                        continue;
                    }
                    boolean enqueued = NotificationCaptureStore.enqueue(context, capture);
                    if (enqueued) {
                        result.queued++;
                        Log.i(TAG, "queued amount=" + capture.optInt("amount")
                            + " merchant=" + shorten(capture.optString("merchant"), 48)
                            + " smsId=" + id);
                    }
                } catch (Exception rowErr) {
                    result.failed++;
                    Log.w(TAG, "scan_row_failed smsId=" + id, rowErr);
                }
            }
            Log.i(TAG, "scan_done scanned=" + result.scanned + " queued=" + result.queued + " ignored=" + result.ignored + " failed=" + result.failed);
        } catch (Exception err) {
            result.failed++;
            NotificationCaptureStore.recordError(context, "sms_scan_failed", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
            Log.w(TAG, "scan_failed", err);
        } finally {
            if (cursor != null) cursor.close();
        }
        return result;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String shorten(String value, int max) {
        String cleaned = safe(value);
        if (cleaned.length() <= max) return cleaned;
        return cleaned.substring(0, Math.max(0, max - 1)) + "...";
    }

    static final class ScanResult {
        boolean permissionGranted;
        int scanned;
        int queued;
        int ignored;
        int failed;
    }
}
