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

/**
 * 위젯 v3 — 홈 화면에서 바로 두 가지 질문에 답한다.
 *   1) 지금 얼마 써도 되나 (safeToSpend, 앱 홈 히어로와 같은 2주 사이클 값)
 *   2) 지금까지 얼마 적립했나 (포인트 합계 + 상위 2개 버킷)
 * v2 는 '오늘의 적립'과 4개 고정 포인트 행만 그렸고 safeToSpend 는 저장만 되고
 * 렌더되지 않았다.
 */
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
            JSONObject safeToSpend = snapshot.optJSONObject("safeToSpend");
            JSONObject points = snapshot.optJSONObject("points");
            JSONArray buckets = snapshot.optJSONArray("pointBuckets");
            boolean stsReady = safeToSpend != null && safeToSpend.optBoolean("ready", false);

            views.setTextViewText(R.id.reward_widget_title, weekTitle(safeToSpend));
            views.setTextViewText(R.id.reward_widget_updated, updatedLabel(snapshot.optLong("storedAt", 0)));
            views.setTextViewText(R.id.reward_widget_week_amount, weekAmountLabel(safeToSpend, stsReady));
            views.setTextViewText(R.id.reward_widget_week_sub, weekSubLabel(safeToSpend, stsReady));
            views.setProgressBar(R.id.reward_widget_week_progress, 100, spentPercent(safeToSpend), false);

            boolean pointsReady = snapshot.optBoolean("baselineReady", false) && points != null;
            views.setTextViewText(R.id.reward_widget_points_value, pointsValueLabel(points, pointsReady));
            views.setTextViewText(R.id.reward_widget_points_sub, pointsSubLabel(points, pointsReady));

            setBucketRow(
                views,
                buckets,
                0,
                R.id.reward_widget_point1_mark,
                R.id.reward_widget_point1_label,
                R.id.reward_widget_point1_value,
                R.id.reward_widget_point1_progress
            );
            setBucketRow(
                views,
                buckets,
                1,
                R.id.reward_widget_point2_mark,
                R.id.reward_widget_point2_label,
                R.id.reward_widget_point2_value,
                R.id.reward_widget_point2_progress
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
        views.setTextViewText(R.id.reward_widget_title, "써도 되는 돈");
        views.setTextViewText(R.id.reward_widget_updated, "대기 중");
        views.setTextViewText(R.id.reward_widget_week_amount, "앱을 열어 갱신");
        views.setTextViewText(R.id.reward_widget_week_sub, "홈 화면 계산 후 표시");
        views.setProgressBar(R.id.reward_widget_week_progress, 100, 0, false);
        views.setTextViewText(R.id.reward_widget_points_value, "적립 -");
        views.setTextViewText(R.id.reward_widget_points_sub, "-");
        setEmptyBucketRow(views, R.id.reward_widget_point1_mark, R.id.reward_widget_point1_label, R.id.reward_widget_point1_value, R.id.reward_widget_point1_progress);
        setEmptyBucketRow(views, R.id.reward_widget_point2_mark, R.id.reward_widget_point2_label, R.id.reward_widget_point2_value, R.id.reward_widget_point2_progress);
    }

    // 히어로 제목은 스냅샷의 기간 라벨을 그대로 쓴다 — 앱이 '이번 2주'로 계산하면
    // 위젯도 '이번 2주'라고 말한다. 두 화면이 다른 기간을 주장하지 않게 하는 장치.
    private static String weekTitle(JSONObject safeToSpend) {
        String period = safeToSpend == null ? "" : safeToSpend.optString("periodLabel", "");
        return period.length() > 0 ? period + " 써도 되는 돈" : "써도 되는 돈";
    }

    private static String weekAmountLabel(JSONObject safeToSpend, boolean ready) {
        if (!ready) return "앱을 열어 갱신";
        long amount = safeToSpend.optLong("amount", 0);
        if (amount < 0) return "−" + formatNumber(Math.abs(amount)) + "원";
        return formatNumber(amount) + "원";
    }

    private static String weekSubLabel(JSONObject safeToSpend, boolean ready) {
        if (!ready) return "홈 화면 계산 후 표시";
        long amount = safeToSpend.optLong("amount", 0);
        if (amount < 0) return "예산을 " + formatNumber(Math.abs(amount)) + "원 넘겼어요";
        long days = safeToSpend.optLong("daysRemaining", 0);
        long perDay = safeToSpend.optLong("perDay", 0);
        long weekDays = safeToSpend.optLong("weekDays", 0);
        long weekAmount = safeToSpend.optLong("weekAmount", 0);
        StringBuilder sub = new StringBuilder();
        sub.append("남은 ").append(days).append("일 · 하루 ").append(formatNumber(perDay)).append("원");
        if (weekDays > 0) {
            sub.append(" · ").append(weekDays).append("일 ").append(formatNumber(weekAmount)).append("원");
        }
        return sub.toString();
    }

    private static int spentPercent(JSONObject safeToSpend) {
        if (safeToSpend == null) return 0;
        double ratio = safeToSpend.optDouble("spentRatio", 0);
        if (Double.isNaN(ratio) || Double.isInfinite(ratio)) return 0;
        long percent = Math.round(ratio * 100.0);
        return (int) Math.max(0, Math.min(100, percent));
    }

    private static String pointsValueLabel(JSONObject points, boolean ready) {
        if (!ready) return "적립 -";
        long monthPoints = points.optLong("monthPoints", 0);
        String sign = monthPoints < 0 ? "−" : "+";
        return "적립 " + sign + formatNumber(Math.abs(monthPoints)) + "P";
    }

    private static String pointsSubLabel(JSONObject points, boolean ready) {
        if (!ready) return "-";
        long today = points.optLong("todayPoints", 0);
        long projected = points.optLong("projectedMonthPoints", 0);
        return "오늘 +" + formatNumber(today) + " · 월 예상 " + formatNumber(projected);
    }

    private static void setBucketRow(
        RemoteViews views,
        JSONArray buckets,
        int index,
        int markViewId,
        int labelViewId,
        int valueViewId,
        int progressViewId
    ) {
        JSONObject bucket = buckets == null ? null : buckets.optJSONObject(index);
        if (bucket == null) {
            setEmptyBucketRow(views, markViewId, labelViewId, valueViewId, progressViewId);
            return;
        }
        String rowLabel = shortLabel(bucket.optString("label", ""));
        long monthPoints = bucket.optLong("monthPoints", 0);
        long targetAmount = bucket.optLong("targetAmount", 0);
        int progress = progressPercent(monthPoints, targetAmount);
        views.setTextViewText(markViewId, markForLabel(rowLabel));
        views.setTextViewText(labelViewId, rowLabel);
        views.setTextViewText(valueViewId, pointProgressLabel(monthPoints, progress));
        views.setProgressBar(progressViewId, 100, progress, false);
    }

    private static void setEmptyBucketRow(RemoteViews views, int markViewId, int labelViewId, int valueViewId, int progressViewId) {
        views.setTextViewText(markViewId, "P");
        views.setTextViewText(labelViewId, "포인트 -");
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

    // 버킷 키별 특수 처리를 없앴다 — 사용자가 만든 포인트 항목도 똑같이 보인다.
    private static String shortLabel(String label) {
        String text = label == null ? "" : label.replaceAll("\\s*포인트\\s*$", "").trim();
        return text.length() > 0 ? text : "포인트";
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
