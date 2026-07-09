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
            setBucketRow(
                views,
                buckets,
                0,
                R.id.reward_widget_wine_mark,
                R.id.reward_widget_wine,
                R.id.reward_widget_wine_value,
                R.id.reward_widget_wine_progress,
                "와인",
                focusBucketKey
            );
            setBucketRow(
                views,
                buckets,
                1,
                R.id.reward_widget_ingredient_mark,
                R.id.reward_widget_ingredient,
                R.id.reward_widget_ingredient_value,
                R.id.reward_widget_ingredient_progress,
                "재료",
                focusBucketKey
            );
            setBucketRow(
                views,
                buckets,
                2,
                R.id.reward_widget_travel_mark,
                R.id.reward_widget_travel,
                R.id.reward_widget_travel_value,
                R.id.reward_widget_travel_progress,
                "여행",
                focusBucketKey
            );
            setBucketRow(
                views,
                buckets,
                3,
                R.id.reward_widget_custom_mark,
                R.id.reward_widget_custom,
                R.id.reward_widget_custom_value,
                R.id.reward_widget_custom_progress,
                "포인트",
                focusBucketKey
            );
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
        setEmptyBucketRow(views, R.id.reward_widget_wine_mark, R.id.reward_widget_wine, R.id.reward_widget_wine_value, R.id.reward_widget_wine_progress, "와인");
        setEmptyBucketRow(views, R.id.reward_widget_ingredient_mark, R.id.reward_widget_ingredient, R.id.reward_widget_ingredient_value, R.id.reward_widget_ingredient_progress, "재료");
        setEmptyBucketRow(views, R.id.reward_widget_travel_mark, R.id.reward_widget_travel, R.id.reward_widget_travel_value, R.id.reward_widget_travel_progress, "여행");
        setEmptyBucketRow(views, R.id.reward_widget_custom_mark, R.id.reward_widget_custom, R.id.reward_widget_custom_value, R.id.reward_widget_custom_progress, "포인트");
    }

    private static void setBucketRow(
        RemoteViews views,
        JSONArray buckets,
        int index,
        int markViewId,
        int labelViewId,
        int valueViewId,
        int progressViewId,
        String fallbackLabel,
        String focusBucketKey
    ) {
        JSONObject bucket = buckets == null ? null : buckets.optJSONObject(index);
        if (bucket == null) {
            setEmptyBucketRow(views, markViewId, labelViewId, valueViewId, progressViewId, fallbackLabel);
            return;
        }
        String key = bucket.optString("key", "");
        String rowLabel = shortLabel(bucket.optString("label", ""), key, fallbackLabel);
        long monthPoints = bucket.optLong("monthPoints", 0);
        long targetAmount = bucket.optLong("targetAmount", 0);
        long todayBonusPoints = bucket.optLong("todayBonusPoints", 0);
        String bonus = todayBonusPoints > 0 && key.equals(focusBucketKey)
            ? " +" + formatNumber(todayBonusPoints)
            : "";
        int progress = progressPercent(monthPoints, targetAmount);
        views.setTextViewText(markViewId, markForLabel(rowLabel));
        views.setTextViewText(labelViewId, rowLabel + bonus);
        views.setTextViewText(valueViewId, pointProgressLabel(monthPoints, progress));
        views.setProgressBar(progressViewId, 100, progress, false);
    }

    private static void setEmptyBucketRow(RemoteViews views, int markViewId, int labelViewId, int valueViewId, int progressViewId, String fallbackLabel) {
        views.setTextViewText(markViewId, markForLabel(fallbackLabel));
        views.setTextViewText(labelViewId, fallbackLabel + " -");
        views.setTextViewText(valueViewId, "-");
        views.setProgressBar(progressViewId, 100, 0, false);
    }

    private static int progressPercent(long value, long target) {
        if (target <= 0) return 0;
        long percent = Math.round((Math.max(0, value) * 100.0) / target);
        return (int) Math.max(0, Math.min(100, percent));
    }

    private static String pointProgressLabel(long monthPoints, int progress) {
        return formatNumber(monthPoints) + "p/" + progress + "%";
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
            if (focusBucketKey.length() > 0) return shortLabel("", focusBucketKey, "집중") + " 집중";
        }
        return "평소 " + formatNumber(dailyBaseline) + "원";
    }

    private static String shortLabel(String label, String key, String fallback) {
        if ("winePurchase".equals(key)) return "와인";
        if ("premiumIngredients".equals(key)) return "재료";
        if ("travelFund".equals(key)) return "여행";
        String text = label == null ? "" : label.replaceAll("\\s*포인트\\s*$", "").trim();
        return text.length() > 0 ? text : fallback;
    }

    private static String markForLabel(String label) {
        String text = label == null ? "" : label.trim();
        if (text.length() == 0) return "P";
        int firstCodePoint = text.codePointAt(0);
        return new String(Character.toChars(firstCodePoint));
    }

    private static String updatedLabel(long storedAt) {
        if (storedAt <= 0) return "대기 중";
        return new SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(new Date(storedAt));
    }

    private static String formatNumber(long value) {
        return NumberFormat.getIntegerInstance(Locale.KOREA).format(value);
    }
}
