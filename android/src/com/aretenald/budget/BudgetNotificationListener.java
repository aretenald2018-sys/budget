package com.aretenald.budget;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;

import java.util.Locale;

public class BudgetNotificationListener extends NotificationListenerService {
    private static final String[] FINANCE_SOURCE_MARKERS = {
        "hana", "하나", "keb", "toss", "토스", "viva", "naver", "네이버", "kakao", "카카오",
        "shinhan", "신한", "woori", "우리", "kookmin", "국민", "kb", "lotte", "롯데",
        "hyundai", "현대", "samsung", "삼성", "bccard", "bc카드", "nonghyup", "농협",
        "ibk", "기업", "kbank", "케이뱅크", "payco", "페이코", "card", "카드",
        "bank", "은행", "pay", "페이"
    };

    private static final String[] MESSAGE_SOURCE_MARKERS = {
        "message", "messaging", "sms", "mms", "문자", "메시지"
    };

    private static final String[] PAYMENT_MARKERS = {
        "결제", "승인", "이용", "출금", "입금", "송금", "체크", "신용", "누적이용금액", "카드", "일시불"
    };

    private static final String[] NOISE_MARKERS = {
        "인증번호", "본인확인", "로그인", "광고", "쿠폰", "혜택", "이벤트", "배송", "택배"
    };

    @Override
    public void onListenerConnected() {
        NativeIngestClient.flushAsync(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String packageName = safe(sbn.getPackageName());
        if (packageName.length() == 0 || getPackageName().equals(packageName)) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        Bundle extras = notification.extras;
        String title = textFrom(extras, Notification.EXTRA_TITLE);
        String text = textFrom(extras, Notification.EXTRA_TEXT);
        String bigText = textFrom(extras, Notification.EXTRA_BIG_TEXT);
        JSONArray textLines = linesFrom(extras);
        String appLabel = appLabel(packageName);
        String body = joinNotificationText(title, text, bigText, textLines);

        if (!isPaymentCandidate(packageName, appLabel, body)) return;

        long capturedAt = System.currentTimeMillis();
        long postTime = sbn.getPostTime() > 0 ? sbn.getPostTime() : capturedAt;
        String id = makeId(packageName, sbn.getId(), postTime, body);
        NativeIngestClient.NativePayload payload = new NativeIngestClient.NativePayload(
            id,
            packageName,
            appLabel,
            title,
            text,
            bigText,
            textLines,
            postTime,
            capturedAt
        );
        NativeIngestClient.enqueueAndSendAsync(this, payload);
    }

    private boolean isPaymentCandidate(String packageName, String appLabel, String body) {
        String text = safe(body);
        if (text.length() == 0) return false;
        if (!text.contains("원")) return false;

        boolean hasPaymentMarker = containsAny(text, PAYMENT_MARKERS);
        if (!hasPaymentMarker) return false;

        boolean hasNoiseMarker = containsAny(text, NOISE_MARKERS);
        if (hasNoiseMarker && !text.contains("결제") && !text.contains("승인")) return false;

        String source = (safe(packageName) + " " + safe(appLabel)).toLowerCase(Locale.ROOT);
        boolean financeSource = containsAny(source, FINANCE_SOURCE_MARKERS);
        boolean messageSource = containsAny(source, MESSAGE_SOURCE_MARKERS);
        return financeSource || messageSource;
    }

    private boolean containsAny(String value, String[] markers) {
        String text = safe(value).toLowerCase(Locale.ROOT);
        for (String marker : markers) {
            if (text.contains(marker.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private String appLabel(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(info);
            return label == null ? packageName : label.toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private static String textFrom(Bundle extras, String key) {
        if (extras == null || key == null) return "";
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString();
    }

    private static JSONArray linesFrom(Bundle extras) {
        JSONArray out = new JSONArray();
        if (extras == null) return out;
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines == null) return out;
        for (CharSequence line : lines) {
            if (line == null) continue;
            String text = line.toString().trim();
            if (text.length() > 0) out.put(text);
        }
        return out;
    }

    private static String joinNotificationText(String title, String text, String bigText, JSONArray textLines) {
        StringBuilder out = new StringBuilder();
        append(out, title);
        append(out, text);
        append(out, bigText);
        for (int i = 0; i < textLines.length(); i++) {
            append(out, textLines.optString(i, ""));
        }
        return out.toString();
    }

    private static void append(StringBuilder out, String value) {
        String text = safe(value).trim();
        if (text.length() == 0) return;
        if (out.length() > 0) out.append('\n');
        out.append(text);
    }

    private static String makeId(String packageName, int notificationId, long postTime, String body) {
        String base = safe(packageName) + "|" + notificationId + "|" + postTime + "|" + safe(body);
        return safe(packageName) + ":" + notificationId + ":" + postTime + ":" + Integer.toHexString(base.hashCode());
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
