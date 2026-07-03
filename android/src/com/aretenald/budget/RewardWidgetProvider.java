package com.aretenald.budget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class RewardWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, RewardWidgetProvider.class);
        updateWidgets(context, manager, manager.getAppWidgetIds(component));
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        if (appWidgetIds == null) return;
        for (int appWidgetId : appWidgetIds) {
            manager.updateAppWidget(appWidgetId, buildViews(context));
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.reward_widget);
        views.setOnClickPendingIntent(R.id.reward_widget_root, openAppIntent(context));
        try {
            JSONObject snapshot = new JSONObject(RewardWidgetStore.snapshotJson(context));
            JSONArray buckets = snapshot.optJSONArray("pointBuckets");
            JSONObject dailyReward = snapshot.optJSONObject("dailyReward");
            String focusBucketKey = dailyReward == null ? "" : dailyReward.optString("focusBucketKey", "");
            boolean ready = snapshot.optBoolean("baselineReady", false) && buckets != null && buckets.length() > 0;
            views.setTextViewText(R.id.reward_widget_title, isDailyRewardSelected(dailyReward) ? "오늘 카드" : "오늘의 적립");
            views.setTextViewText(R.id.reward_widget_updated, updatedLabel(snapshot.optLong("storedAt", 0)));
            views.setTextViewText(R.id.reward_widget_saved, ready
                ? "+" + formatNumber(snapshot.optLong("todaySaved", 0)) + "원"
                : "앱을 열어 갱신");
            views.setTextViewText(R.id.reward_widget_baseline, ready
                ? dailyRewardLine(dailyReward, focusBucketKey, snapshot.optLong("dailyBaseline", 0))
                : "홈 화면 계산 후 표시");
            setBucketText(views, buckets, 0, R.id.reward_widget_wine, "와인", focusBucketKey);
            setBucketText(views, buckets, 1, R.id.reward_widget_ingredient, "재료", focusBucketKey);
            setBucketText(views, buckets, 2, R.id.reward_widget_travel, "여행", focusBucketKey);
        } catch (Exception ignored) {
            renderEmpty(views);
        }
        return views;
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, 0, intent, flags);
    }

    private static void renderEmpty(RemoteViews views) {
        views.setTextViewText(R.id.reward_widget_title, "오늘의 적립");
        views.setTextViewText(R.id.reward_widget_updated, "대기 중");
        views.setTextViewText(R.id.reward_widget_saved, "앱을 열어 갱신");
        views.setTextViewText(R.id.reward_widget_baseline, "홈 화면 계산 후 표시");
        views.setTextViewText(R.id.reward_widget_wine, "와인 -");
        views.setTextViewText(R.id.reward_widget_ingredient, "재료 -");
        views.setTextViewText(R.id.reward_widget_travel, "여행 -");
    }

    private static void setBucketText(RemoteViews views, JSONArray buckets, int index, int viewId, String fallbackLabel, String focusBucketKey) {
        JSONObject bucket = buckets == null ? null : buckets.optJSONObject(index);
        if (bucket == null) {
            views.setTextViewText(viewId, fallbackLabel + " -");
            return;
        }
        String key = bucket.optString("key", "");
        long todayPoints = bucket.optLong("todayPoints", 0);
        long todayBonusPoints = bucket.optLong("todayBonusPoints", 0);
        String bonus = todayBonusPoints > 0 && key.equals(focusBucketKey)
            ? "(+" + formatNumber(todayBonusPoints) + ")"
            : "";
        views.setTextViewText(viewId, shortLabel(key, fallbackLabel)
            + " +" + formatNumber(todayPoints) + bonus);
    }

    private static boolean isDailyRewardSelected(JSONObject dailyReward) {
        return dailyReward != null && "selected".equals(dailyReward.optString("status", ""));
    }

    private static String dailyRewardLine(JSONObject dailyReward, String focusBucketKey, long dailyBaseline) {
        if (isDailyRewardSelected(dailyReward)) {
            String label = dailyReward.optString("label", "");
            String bonusText = dailyReward.optString("bonusText", "");
            if (label.length() > 0 && bonusText.length() > 0) return label + " · " + bonusText;
            if (label.length() > 0) return label;
            if (focusBucketKey.length() > 0) return shortLabel(focusBucketKey, "집중") + " 집중";
        }
        return "평소 " + formatNumber(dailyBaseline) + "원";
    }

    private static String shortLabel(String key, String fallback) {
        if ("winePurchase".equals(key)) return "와인";
        if ("premiumIngredients".equals(key)) return "재료";
        if ("travelFund".equals(key)) return "여행";
        return fallback;
    }

    private static String updatedLabel(long storedAt) {
        if (storedAt <= 0) return "대기 중";
        return new SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(new Date(storedAt));
    }

    private static String formatNumber(long value) {
        return NumberFormat.getIntegerInstance(Locale.KOREA).format(Math.max(0, value));
    }
}
