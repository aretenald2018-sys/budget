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

final class BudgetStatusDashboardRenderer {
    private BudgetStatusDashboardRenderer() {}

    static void update(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.budget_status_dashboard);
        views.setOnClickPendingIntent(R.id.budget_dashboard_root, openAppIntent(context, "", widgetId * 10));
        views.setOnClickPendingIntent(R.id.budget_dashboard_spending_root, openAppIntent(context, "spending", widgetId * 10 + 1));
        views.setOnClickPendingIntent(R.id.budget_dashboard_points_root, openAppIntent(context, "points", widgetId * 10 + 2));
        views.setOnClickPendingIntent(R.id.budget_dashboard_wine_root, openAppIntent(context, "wine", widgetId * 10 + 3));
        try {
            JSONObject snapshot = new JSONObject(BudgetMetricWidgetStore.snapshotJson(context));
            if (!"ready".equals(snapshot.optString("state", "ready"))) throw new IllegalStateException();
            renderSnapshot(views, snapshot);
        } catch (Exception ignored) {
            renderEmpty(views);
        }
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent openAppIntent(Context context, String entry, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        if (!entry.isEmpty()) intent.putExtra("entry", entry);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    private static void renderSnapshot(RemoteViews views, JSONObject snapshot) {
        JSONObject spending = snapshot.optJSONObject("spending");
        JSONObject points = snapshot.optJSONObject("points");
        JSONObject wine = snapshot.optJSONObject("wine");
        renderSpending(views, spending == null ? new JSONObject() : spending);
        renderPoints(views, points == null ? new JSONObject() : points);
        renderWine(views, wine == null ? new JSONObject() : wine);
        views.setTextViewText(R.id.budget_dashboard_meta, "오늘 소비·포인트·와인 요약");
        views.setTextViewText(R.id.budget_dashboard_sync, updatedLabel(snapshot.optLong("storedAt", 0)));
    }

    private static void renderSpending(RemoteViews views, JSONObject spending) {
        long spent = spending.optLong("monthSpent", 0);
        long target = spending.optLong("monthTarget", 0);
        views.setTextViewText(R.id.budget_dashboard_spending_value,
            target > 0 ? money(spent) + " / " + money(target) : money(spent));
        views.setProgressBar(R.id.budget_dashboard_spending_progress, 100,
            spending.optInt("progress", 0), false);
        Double delta = optionalDouble(spending, "twoWeekDeltaPct");
        views.setTextViewText(R.id.budget_dashboard_spending_detail,
            delta == null ? "최근 2주 소비 데이터 필요" : "최근 2주 " + signed(delta) + "%");
        views.setTextViewText(R.id.budget_dashboard_spending_secondary,
            "오늘까지 " + money(spending.optLong("twoWeekSpent", 0)) + " 소비");
    }

    private static void renderPoints(RemoteViews views, JSONObject points) {
        long balance = points.optLong("balance", 0);
        long today = points.optLong("todayPoints", 0);
        views.setTextViewText(R.id.budget_dashboard_points_value,
            points.has("balance") ? signedLong(balance) + "P" : "포인트 설정 필요");
        views.setTextViewText(R.id.budget_dashboard_points_detail,
            "오늘 " + signedLong(today) + "P");
        views.setTextViewText(R.id.budget_dashboard_points_secondary,
            points.optString("focusLabel", "가계부 포인트"));
    }

    private static void renderWine(RemoteViews views, JSONObject wine) {
        String name = wine.optString("name", "와인 데이터 필요");
        String note = wine.optString("note", "테이스팅 노트를 남겨보세요");
        Double rating = optionalDouble(wine, "rating");
        views.setTextViewText(R.id.budget_dashboard_wine_value, name);
        views.setTextViewText(R.id.budget_dashboard_wine_detail,
            rating == null ? note : note + " · " + format(rating, 1) + " / 5.0");
        views.setTextViewText(R.id.budget_dashboard_wine_rating,
            rating == null ? "— / 5.0" : format(rating, 1) + " / 5.0");
    }

    private static void renderEmpty(RemoteViews views) {
        views.setTextViewText(R.id.budget_dashboard_meta, "연결 대기 · 앱을 열어 데이터를 동기화하세요");
        renderSpending(views, new JSONObject());
        renderPoints(views, new JSONObject());
        renderWine(views, new JSONObject());
        views.setTextViewText(R.id.budget_dashboard_points_value, "포인트 설정 필요");
        views.setTextViewText(R.id.budget_dashboard_wine_value, "와인 데이터 필요");
        views.setTextViewText(R.id.budget_dashboard_sync, "동기화 대기");
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
        return String.format(Locale.KOREA, "%1$." + digits + "f", value);
    }

    private static String updatedLabel(long storedAt) {
        return storedAt > 0 ? new SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(new Date(storedAt)) + " 동기화" : "동기화 대기";
    }
}
