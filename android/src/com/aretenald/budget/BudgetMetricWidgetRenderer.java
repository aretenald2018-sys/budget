package com.aretenald.budget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class BudgetMetricWidgetRenderer {
    private BudgetMetricWidgetRenderer() {}

    static void update(Context context, AppWidgetManager manager, int widgetId, String type, String entry) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.budget_metric_widget);
        views.setOnClickPendingIntent(R.id.budget_metric_widget_root, openAppIntent(context, entry, widgetId));
        JSONObject snapshot;
        try {
            snapshot = new JSONObject(BudgetMetricWidgetStore.snapshotJson(context));
            if (!"ready".equals(snapshot.optString("state", "ready"))) throw new IllegalStateException();
            JSONObject section = snapshot.optJSONObject(type);
            if (section == null) throw new IllegalStateException();
            render(views, snapshot, type, section);
        } catch (Exception ignored) {
            renderEmpty(views, titleFor(type));
        }
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent openAppIntent(Context context, String entry, int widgetId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("entry", entry);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, widgetId, intent, flags);
    }

    private static void render(RemoteViews views, JSONObject snapshot, String type, JSONObject section) {
        String title = titleFor(type);
        views.setTextViewText(R.id.budget_metric_widget_kicker, "TOMATO BUDGET");
        views.setTextViewText(R.id.budget_metric_widget_title, title);
        views.setTextViewText(R.id.budget_metric_widget_meta, metaFor(type, section));
        if ("spending".equals(type)) renderSpending(views, section);
        else if ("points".equals(type)) renderPoints(views, section);
        else renderWine(views, section);
        views.setTextViewText(R.id.budget_metric_widget_sync, updatedLabel(snapshot.optLong("storedAt", 0)));
    }

    private static void renderSpending(RemoteViews views, JSONObject spending) {
        long spent = spending.optLong("monthSpent", 0);
        long target = spending.optLong("monthTarget", 0);
        views.setTextViewText(R.id.budget_metric_widget_value, target > 0
            ? money(spent) + " / " + money(target)
            : money(spent));
        views.setProgressBar(R.id.budget_metric_widget_progress, 100, spending.optInt("progress", 0), false);
        Double delta = optionalDouble(spending, "twoWeekDeltaPct");
        views.setTextViewText(R.id.budget_metric_widget_detail, delta == null
            ? "최근 2주 추이 기준 수집 중"
            : "최근 2주 " + signed(delta) + "%");
        views.setTextViewText(R.id.budget_metric_widget_secondary,
            "최근 2주 " + money(spending.optLong("twoWeekSpent", 0)) + " 소비");
    }

    private static void renderPoints(RemoteViews views, JSONObject points) {
        long balance = points.optLong("balance", 0);
        long today = points.optLong("todayPoints", 0);
        views.setTextViewText(R.id.budget_metric_widget_value, signedLong(balance) + "P");
        views.setProgressBar(R.id.budget_metric_widget_progress, 100, 0, false);
        views.setTextViewText(R.id.budget_metric_widget_detail,
            "오늘 " + signedLong(today) + "P · " + points.optString("focusLabel", "포인트"));
        views.setTextViewText(R.id.budget_metric_widget_secondary, "이번 달 적립 포인트");
    }

    private static void renderWine(RemoteViews views, JSONObject wine) {
        String name = wine.optString("name", "기록 없음");
        String note = wine.optString("note", "한 줄 노트를 남겨보세요.");
        Double rating = optionalDouble(wine, "rating");
        views.setTextViewText(R.id.budget_metric_widget_value, name);
        views.setProgressBar(R.id.budget_metric_widget_progress, 100, rating == null ? 0 : (int) Math.round(rating * 20), false);
        views.setTextViewText(R.id.budget_metric_widget_detail, rating == null ? note : "★ " + format(rating, 1) + " · " + note);
        views.setTextViewText(R.id.budget_metric_widget_secondary, wine.optString("tastedAt", "최근 테이스팅"));
    }

    private static void renderEmpty(RemoteViews views, String title) {
        views.setTextViewText(R.id.budget_metric_widget_kicker, "TOMATO BUDGET");
        views.setTextViewText(R.id.budget_metric_widget_title, title);
        views.setTextViewText(R.id.budget_metric_widget_meta, "앱 기록을 기다리는 중");
        views.setTextViewText(R.id.budget_metric_widget_value, "아직 기록 없음");
        views.setProgressBar(R.id.budget_metric_widget_progress, 100, 0, false);
        views.setTextViewText(R.id.budget_metric_widget_detail, "앱을 열어 최신 데이터를 동기화하세요");
        views.setTextViewText(R.id.budget_metric_widget_secondary, "");
        views.setTextViewText(R.id.budget_metric_widget_sync, "동기화 대기");
    }

    private static String titleFor(String type) {
        if ("spending".equals(type)) return "소비 추이";
        if ("points".equals(type)) return "포인트";
        return "와인 노트";
    }

    private static String metaFor(String type, JSONObject section) {
        return "spending".equals(type) ? section.optString("monthKey", "이번 달") : "이번 기록";
    }

    private static Double optionalDouble(JSONObject object, String key) {
        if (object == null || object.isNull(key)) return null;
        double value = object.optDouble(key, Double.NaN);
        return Double.isFinite(value) ? value : null;
    }

    private static String money(long value) {
        return "₩" + NumberFormat.getIntegerInstance(Locale.KOREA).format(Math.max(0, value));
    }

    private static String signedLong(long value) { return value > 0 ? "+" + value : Long.toString(value); }

    private static String signed(double value) { return value > 0 ? "+" + format(value, 1) : format(value, 1); }

    private static String format(double value, int digits) {
        return String.format(Locale.KOREA, "%." + digits + "f", value);
    }

    private static String updatedLabel(long storedAt) {
        return storedAt > 0 ? new SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(new Date(storedAt)) + " 동기화" : "동기화 대기";
    }
}
