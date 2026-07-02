package com.aretenald.budget;

import android.app.Activity;
import android.content.Intent;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

final class BudgetNativeBridge {
    private final Activity activity;

    BudgetNativeBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getStatusJson() {
        JSONObject out = new JSONObject();
        try {
            out.put("available", true);
            out.put("apiUrl", NativeIngestStore.getApiUrl(activity));
            out.put("hasToken", NativeIngestStore.hasToken(activity));
            out.put("notificationAccessEnabled", isNotificationAccessEnabled());
            out.put("logs", NativeIngestStore.readLogs(activity));
        } catch (JSONException ignored) {
        }
        return out.toString();
    }

    @JavascriptInterface
    public void saveIngestSettings(String apiUrl, String token) {
        NativeIngestStore.setApiUrl(activity, apiUrl);
        if (token != null && token.trim().length() > 0) {
            NativeIngestStore.setToken(activity, token);
        }
        NativeIngestClient.flushAsync(activity);
    }

    @JavascriptInterface
    public void clearIngestToken() {
        NativeIngestStore.clearToken(activity);
    }

    @JavascriptInterface
    public void flushIngestQueue() {
        NativeIngestClient.flushAsync(activity);
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

    private boolean isNotificationAccessEnabled() {
        String enabled = Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        return enabled.toLowerCase(Locale.ROOT).contains(activity.getPackageName().toLowerCase(Locale.ROOT));
    }
}
