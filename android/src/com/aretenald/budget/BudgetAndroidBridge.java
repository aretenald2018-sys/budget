package com.aretenald.budget;

import android.app.Activity;
import android.content.Intent;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

final class BudgetAndroidBridge {
    private final Activity activity;

    BudgetAndroidBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getStatusJson() {
        return NotificationCaptureStore.statusJson(activity);
    }

    @JavascriptInterface
    public String listPendingNotificationCaptures(int max) {
        return NotificationCaptureStore.listPendingJson(activity, max);
    }

    @JavascriptInterface
    public void ackNotificationCapture(String id, String txId, String action) {
        NotificationCaptureStore.ack(activity, id, txId, action);
    }

    @JavascriptInterface
    public void failNotificationCapture(String id, String message) {
        NotificationCaptureStore.fail(activity, id, message);
    }

    @JavascriptInterface
    public void openNotificationAccessSettings() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                } catch (Exception ignored) {
                    activity.startActivity(new Intent(Settings.ACTION_SETTINGS));
                }
            }
        });
    }
}
