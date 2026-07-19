package com.aretenald.budget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;

public class SpendingWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) BudgetMetricWidgetRenderer.update(context, manager, id, "spending", "spending");
    }
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, SpendingWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(component)) BudgetMetricWidgetRenderer.update(context, manager, id, "spending", "spending");
    }
}
