package com.aretenald.budget;

import android.app.Activity;
import android.content.Intent;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

final class BudgetAndroidBridge {
    private final Activity activity;

    BudgetAndroidBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getStatusJson() {
        try {
            JSONObject status = new JSONObject(NotificationCaptureStore.statusJson(activity));
            status.put("smsReadPermissionGranted", SmsCaptureScanner.hasReadPermission(activity));
            return status.toString();
        } catch (Exception ignored) {
            return NotificationCaptureStore.statusJson(activity);
        }
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
    public void recordCaptureInfo(String event, String message) {
        NotificationCaptureStore.recordInfo(activity, event, message);
    }

    @JavascriptInterface
    public boolean updateRewardWidgetSnapshot(String json) {
        return RewardWidgetStore.saveSnapshot(activity, json);
    }

    @JavascriptInterface
    public String getRewardWidgetSnapshotJson() {
        return RewardWidgetStore.snapshotJson(activity);
    }

    @JavascriptInterface
    public boolean hasSmsReadPermission() {
        return SmsCaptureScanner.hasReadPermission(activity);
    }

    @JavascriptInterface
    public void requestSmsReadPermission() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                SmsCaptureScanner.requestReadPermission(activity);
            }
        });
    }

    @JavascriptInterface
    public String scanRecentSmsCaptures(int max, int lookbackMinutes) {
        return SmsCaptureScanner.scanRecentJson(activity, max, lookbackMinutes);
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
