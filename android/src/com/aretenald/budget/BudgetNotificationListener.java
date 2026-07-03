package com.aretenald.budget;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.NotificationListenerService.RankingMap;
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
        "message", "messages", "messaging", "sms", "mms", "문자", "메시지",
        "com.google.android.apps.messaging", "com.samsung.android.messaging",
        "com.android.mms", "com.android.messaging", "전화 및 메시지"
    };

    private static final String[] PAYMENT_MARKERS = {
        "결제", "승인", "승인취소", "취소", "이용", "사용", "구매", "출금", "입금",
        "송금", "이체", "체크", "체크카드", "신용", "신용카드", "누적이용금액",
        "카드", "일시불", "할부", "잔액", "자동납부", "납부", "환불", "캐시백"
    };

    private static final String[] CARD_SMS_SOURCE_MARKERS = {
        "[web발신]", "web발신", "[web 발신]", "무료수신"
    };

    private static final String[] NOISE_MARKERS = {
        "인증번호", "본인확인", "로그인", "광고", "쿠폰", "혜택", "이벤트", "배송", "택배"
    };

    @Override
    public void onListenerConnected() {
        NativeIngestStore.recordInfo(this, "notification-listener-connected", "notification listener connected");
        scanActiveNotifications();
        NativeIngestClient.flushAsync(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        handleNotificationPosted(sbn, "posted");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn, RankingMap rankingMap) {
        handleNotificationPosted(sbn, "posted_with_ranking");
    }

    @Override
    public void onListenerDisconnected() {
        NativeIngestStore.recordInfo(this, "notification-listener-disconnected", "notification listener disconnected");
        if (android.os.Build.VERSION.SDK_INT >= 24) {
            try {
                requestRebind(new android.content.ComponentName(this, BudgetNotificationListener.class));
            } catch (Exception ignored) {
            }
        }
    }

    private void scanActiveNotifications() {
        try {
            StatusBarNotification[] rows = getActiveNotifications();
            if (rows == null) return;
            NativeIngestStore.recordInfo(this, "notification-active-scan", "active notification scan: " + rows.length);
            for (StatusBarNotification row : rows) {
                handleNotificationPosted(row, "active_scan");
            }
        } catch (Exception err) {
            NativeIngestStore.recordInfo(this, "notification-active-scan-failed", "active notification scan failed: " + safe(err.getMessage()));
        }
    }

    private void handleNotificationPosted(StatusBarNotification sbn, String captureReason) {
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
        appendExtraPaymentText(extras, textLines);
        appendLine(textLines, notification.tickerText == null ? "" : notification.tickerText.toString());
        String appLabel = appLabel(packageName);
        String body = joinNotificationText(title, text, bigText, textLines);

        if (!isPaymentCandidate(packageName, appLabel, body)) {
            recordIgnoredIfUseful(packageName, appLabel, body);
            return;
        }

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

        boolean hasPaymentMarker = containsAny(text, PAYMENT_MARKERS);
        boolean hasAmount = hasMoneyAmount(text);
        boolean hasCardShape = isCardSmsPaymentBody(text);

        boolean hasNoiseMarker = containsAny(text, NOISE_MARKERS);
        if (hasNoiseMarker && !hasPaymentMarker && !hasAmount && !hasCardShape) return false;

        String source = (safe(packageName) + " " + safe(appLabel)).toLowerCase(Locale.ROOT);
        boolean financeSource = containsAny(source, FINANCE_SOURCE_MARKERS);
        boolean messageSource = containsAny(source, MESSAGE_SOURCE_MARKERS);
        if (financeSource) return true;
        return hasCardShape || (hasPaymentMarker || hasAmount) && messageSource;
    }

    private void recordIgnoredIfUseful(String packageName, String appLabel, String body) {
        String source = (safe(packageName) + " " + safe(appLabel)).toLowerCase(Locale.ROOT);
        boolean likelyRelevantSource = containsAny(source, FINANCE_SOURCE_MARKERS) || containsAny(source, MESSAGE_SOURCE_MARKERS);
        String text = safe(body);
        boolean likelyRelevantBody = containsAny(text, PAYMENT_MARKERS) || hasMoneyAmount(text) || isCardSmsPaymentBody(text);
        if (!likelyRelevantSource && !likelyRelevantBody) return;
        NativeIngestStore.recordInfo(this, "notification-ignored", "ignored notification: " + safe(appLabel) + " / " + packageName + " / " + snippet(text));
    }

    private boolean containsAny(String value, String[] markers) {
        String text = safe(value).toLowerCase(Locale.ROOT);
        for (String marker : markers) {
            if (text.contains(marker.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private boolean isCardSmsPaymentBody(String value) {
        String text = safe(value).toLowerCase(Locale.ROOT).replace('\n', ' ');
        boolean hasSmsMarker = containsAny(text, CARD_SMS_SOURCE_MARKERS);
        boolean hasCardApprovalShape = text.matches("(?s).*[가-힣a-z]+[0-9*]{2,}\\s*(승인|취소).*?[0-9,]+\\s*(원|krw).*?(일시불|할부|체크)?.*");
        boolean hasAccumulatedUsage = text.contains("누적이용금액") || text.matches("(?s).*누적\\s*[0-9,]+\\s*원.*");
        return (hasSmsMarker || hasAccumulatedUsage) && hasCardApprovalShape;
    }

    private boolean hasMoneyAmount(String value) {
        String text = safe(value).toLowerCase(Locale.ROOT);
        return text.matches("(?s).*\\d[\\d,]*\\s*(원|만원|krw).*")
            || text.matches("(?s).*₩\\s*\\d[\\d,]*.*");
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
            appendLine(out, line == null ? "" : line.toString());
        }
        return out;
    }

    private static void appendExtraPaymentText(Bundle extras, JSONArray out) {
        if (extras == null || out == null) return;
        appendLine(out, textFrom(extras, Notification.EXTRA_TITLE_BIG));
        appendLine(out, textFrom(extras, Notification.EXTRA_SUB_TEXT));
        appendLine(out, textFrom(extras, Notification.EXTRA_SUMMARY_TEXT));
        appendLine(out, textFrom(extras, Notification.EXTRA_INFO_TEXT));
        appendMessagingStyleLines(extras, out);

        for (String key : extras.keySet()) {
            if (key == null) continue;
            Object value = extras.get(key);
            if (value instanceof CharSequence) {
                appendLine(out, value.toString());
            } else if (value instanceof CharSequence[]) {
                CharSequence[] rows = (CharSequence[]) value;
                for (CharSequence row : rows) {
                    appendLine(out, row == null ? "" : row.toString());
                }
            } else if (value instanceof String[]) {
                String[] rows = (String[]) value;
                for (String row : rows) {
                    appendLine(out, row);
                }
            }
        }
    }

    private static void appendMessagingStyleLines(Bundle extras, JSONArray out) {
        Parcelable[] rows = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (rows == null) return;
        for (Parcelable row : rows) {
            if (!(row instanceof Bundle)) continue;
            Bundle message = (Bundle) row;
            String sender = textFrom(message, "sender");
            String text = textFrom(message, "text");
            if (text.length() == 0) continue;
            appendLine(out, sender.length() > 0 ? sender + " " + text : text);
        }
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

    private static void appendLine(JSONArray out, String value) {
        String text = safe(value).replace('\r', '\n').trim();
        if (text.length() == 0) return;
        String[] rows = text.split("\\n+");
        for (String row : rows) {
            String line = safe(row).trim();
            if (line.length() == 0 || containsLine(out, line)) continue;
            out.put(line);
        }
    }

    private static boolean containsLine(JSONArray out, String value) {
        for (int i = 0; i < out.length(); i++) {
            if (value.equals(out.optString(i, ""))) return true;
        }
        return false;
    }

    private static String snippet(String value) {
        String text = safe(value).replace('\n', ' ').trim();
        if (text.length() <= 80) return text;
        return text.substring(0, 80);
    }

    private static String makeId(String packageName, int notificationId, long postTime, String body) {
        String base = safe(packageName) + "|" + notificationId + "|" + postTime + "|" + safe(body);
        return safe(packageName) + ":" + notificationId + ":" + postTime + ":" + Integer.toHexString(base.hashCode());
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
