package com.aretenald.budget;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

public class RunTrackingService extends Service implements LocationListener {
    static final String ACTION_START = "com.aretenald.budget.run.START";
    static final String ACTION_PAUSE = "com.aretenald.budget.run.PAUSE";
    static final String ACTION_RESUME = "com.aretenald.budget.run.RESUME";
    static final String ACTION_STOP = "com.aretenald.budget.run.STOP";
    static final String ACTION_CANCEL = "com.aretenald.budget.run.CANCEL";
    private static final String CHANNEL_ID = "budget_run_tracking";
    private static final int NOTIFICATION_ID = 4207;
    private LocationManager locationManager;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_START.equals(action)) {
            startForeground(NOTIFICATION_ID, notification("GPS 신호를 찾는 중…"));
            if (!"recording".equals(RunTrackingStore.state(this)) && !"paused".equals(RunTrackingStore.state(this))) {
                RunTrackingStore.start(this);
            }
            requestUpdates();
        } else if (ACTION_PAUSE.equals(action)) {
            RunTrackingStore.pause(this);
            stopUpdates();
            notifyState("러닝 일시정지됨");
        } else if (ACTION_RESUME.equals(action)) {
            RunTrackingStore.resume(this);
            requestUpdates();
            notifyState("러닝 기록 중");
        } else if (ACTION_STOP.equals(action)) {
            stopUpdates();
            RunTrackingStore.finish(this);
            if ("idle".equals(RunTrackingStore.state(this))) {
                stopForeground(true);
                stopSelf();
            } else {
                startForeground(NOTIFICATION_ID, notification("저장할 GPS 좌표가 부족합니다"));
            }
        } else if (ACTION_CANCEL.equals(action)) {
            stopUpdates();
            RunTrackingStore.cancel(this);
            stopForeground(true);
            stopSelf();
        }
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (RunTrackingStore.append(this, location)) {
            String text = String.format(java.util.Locale.KOREA, "%.2f km · %s", RunTrackingStore.distance(this) / 1000f, formatDuration(RunTrackingStore.activeDurationSeconds(this)));
            notifyState(text);
        }
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { notifyState("GPS가 꺼져 있습니다"); }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopUpdates();
        super.onDestroy();
    }

    static boolean hasLocationPermission(Context context) {
        if (Build.VERSION.SDK_INT < 23) return true;
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static void send(Context context, String action) {
        Intent intent = new Intent(context, RunTrackingService.class).setAction(action);
        if (ACTION_START.equals(action) && Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }

    private void requestUpdates() {
        if (!hasLocationPermission(this) || locationManager == null) return;
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0f, this, Looper.getMainLooper());
        } catch (Exception ignored) {
        }
    }

    private void stopUpdates() {
        if (locationManager == null) return;
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "러닝 GPS 기록", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("화면이 꺼져도 러닝 경로를 기록합니다.");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("러닝 기록 중")
            .setContentText(text)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private void notifyState(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(text));
    }

    private static String formatDuration(long seconds) {
        long minutes = seconds / 60;
        long remain = seconds % 60;
        return String.format(java.util.Locale.KOREA, "%d:%02d", minutes, remain);
    }
}
