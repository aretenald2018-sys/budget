package com.aretenald.budget;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

public class BudgetNotificationService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.isOngoing()) return;
        try {
            JSONObject capture = PaymentNotificationParser.parse(this, sbn);
            if (capture != null) {
                NotificationCaptureStore.enqueue(this, capture);
            }
        } catch (Exception err) {
            NotificationCaptureStore.recordError(this, "capture_failed", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
        }
    }

    @Override
    public void onListenerConnected() {
        NotificationCaptureStore.recordInfo(this, "listener_connected", "notification listener connected");
    }

    @Override
    public void onListenerDisconnected() {
        NotificationCaptureStore.recordInfo(this, "listener_disconnected", "notification listener disconnected");
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
