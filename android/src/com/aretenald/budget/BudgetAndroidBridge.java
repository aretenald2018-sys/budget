package com.aretenald.budget;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
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
    public void setActiveRunActivityImportUser(String uid) {
        RunActivityImportStore.setActiveUid(activity, uid);
    }

    @JavascriptInterface
    public String listPendingRunActivityImports(int max) {
        return RunActivityImportStore.listPendingJson(activity, max);
    }

    @JavascriptInterface
    public void ackRunActivityImport(String id, String uid, String activityId) {
        RunActivityImportStore.ack(activity, id, uid, activityId);
    }

    @JavascriptInterface
    public void failRunActivityImport(String id, String uid, String message) {
        RunActivityImportStore.fail(activity, id, uid, message);
    }

    @JavascriptInterface
    public String getRunActivityImportStatusJson() {
        return RunActivityImportStore.statusJson(activity);
    }

    @JavascriptInterface
    public String getRunRecorderStatusJson() {
        return RunTrackingStore.statusJson(activity, RunTrackingService.hasLocationPermission(activity));
    }

    @JavascriptInterface
    public String startRunRecorder() {
        if (!RunActivityImportStore.hasActiveUid(activity)) return "user_required";
        if (!RunTrackingService.hasLocationPermission(activity)) return "permission_required";
        String state = RunTrackingStore.state(activity);
        if ("recording".equals(state) || "paused".equals(state)) return "already_active";
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { RunTrackingService.send(activity, RunTrackingService.ACTION_START); }
        });
        return "started";
    }

    @JavascriptInterface
    public void pauseRunRecorder() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { RunTrackingService.send(activity, RunTrackingService.ACTION_PAUSE); }
        });
    }

    @JavascriptInterface
    public void resumeRunRecorder() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { RunTrackingService.send(activity, RunTrackingService.ACTION_RESUME); }
        });
    }

    @JavascriptInterface
    public void stopRunRecorder() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { RunTrackingService.send(activity, RunTrackingService.ACTION_STOP); }
        });
    }

    @JavascriptInterface
    public void cancelRunRecorder() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { RunTrackingService.send(activity, RunTrackingService.ACTION_CANCEL); }
        });
    }

    @JavascriptInterface
    public void requestRunLocationPermission() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT < 23) return;
                if (Build.VERSION.SDK_INT >= 33) {
                    activity.requestPermissions(new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS,
                    }, 4207);
                } else {
                    activity.requestPermissions(new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    }, 4207);
                }
            }
        });
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
