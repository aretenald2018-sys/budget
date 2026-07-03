package com.aretenald.budget;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

public class BudgetNotificationService extends NotificationListenerService {
    private static final String TAG = "BudgetNotifSvc";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        captureNotification(sbn, "posted");
    }

    @Override
    public void onListenerConnected() {
        NotificationCaptureStore.recordInfo(this, "listener_connected", "notification listener connected");
        Log.i(TAG, "listener_connected");
        captureActiveNotifications("listener_connected");
    }

    @Override
    public void onListenerDisconnected() {
        NotificationCaptureStore.recordInfo(this, "listener_disconnected", "notification listener disconnected");
        Log.i(TAG, "listener_disconnected");
    }

    private boolean captureNotification(StatusBarNotification sbn, String reason) {
        if (sbn == null || sbn.isOngoing()) return false;
        try {
            JSONObject capture = PaymentNotificationParser.parse(this, sbn);
            if (capture != null) {
                boolean enqueued = NotificationCaptureStore.enqueue(this, capture);
                Log.i(TAG, (enqueued ? "queued" : "already_final") + " reason=" + safe(reason)
                    + " amount=" + capture.optInt("amount")
                    + " merchant=" + shorten(capture.optString("merchant"), 48)
                    + " package=" + safe(sbn.getPackageName())
                    + " key=" + shorten(safe(sbn.getKey()), 96));
                return enqueued;
            } else {
                String ignored = PaymentNotificationParser.ignoredDebugText(this, sbn);
                if (ignored.length() > 0) {
                    NotificationCaptureStore.recordIgnored(this, "parser_ignored", ignored);
                    Log.i(TAG, "ignored reason=" + safe(reason)
                        + " package=" + safe(sbn.getPackageName())
                        + " key=" + shorten(safe(sbn.getKey()), 96)
                        + " details=" + shorten(ignored, 180));
                }
            }
        } catch (Exception err) {
            NotificationCaptureStore.recordError(this, "capture_failed", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
            Log.w(TAG, "capture_failed reason=" + safe(reason)
                + " package=" + safe(sbn.getPackageName())
                + " key=" + shorten(safe(sbn.getKey()), 96), err);
        }
        return false;
    }

    private void captureActiveNotifications(String reason) {
        try {
            StatusBarNotification[] rows = getActiveNotifications();
            int scanned = rows == null ? 0 : rows.length;
            int queued = 0;
            if (rows != null) {
                for (StatusBarNotification row : rows) {
                    if (captureNotification(row, "active:" + safe(reason))) queued++;
                }
            }
            String message = "reason=" + safe(reason) + " scanned=" + scanned + " queued=" + queued;
            NotificationCaptureStore.recordInfo(this, "active_scan", message);
            Log.i(TAG, "active_scan " + message);
        } catch (Exception err) {
            String message = err.getClass().getSimpleName() + ": " + safe(err.getMessage());
            NotificationCaptureStore.recordError(this, "active_scan_failed", message);
            Log.w(TAG, "active_scan_failed reason=" + safe(reason), err);
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String shorten(String value, int max) {
        String cleaned = safe(value);
        if (cleaned.length() <= max) return cleaned;
        return cleaned.substring(0, Math.max(0, max - 1)) + "...";
    }
}
