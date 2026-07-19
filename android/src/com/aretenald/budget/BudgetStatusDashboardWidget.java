package com.aretenald.budget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;

public class BudgetStatusDashboardWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) BudgetStatusDashboardRenderer.update(context, manager, id);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, BudgetStatusDashboardWidget.class);
        for (int id : manager.getAppWidgetIds(component)) {
            BudgetStatusDashboardRenderer.update(context, manager, id);
        }
    }
}
