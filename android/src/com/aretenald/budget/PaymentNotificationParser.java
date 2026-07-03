package com.aretenald.budget;

import android.app.Notification;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PaymentNotificationParser {
    private static final Pattern AMOUNT_RE = Pattern.compile("([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\s*원");
    private static final Pattern DATE_TIME_RE = Pattern.compile("(\\d{1,2})[./-](\\d{1,2})\\s*(\\d{1,2}):(\\d{2})");
    private static final Pattern NAVER_PAY_PAYMENT_RE = Pattern.compile("\\[?\\s*네이버\\s*페이\\s*\\]?\\s*((?:자동\\s*결제|결제\\s*완료))\\s*안내\\s+(.+?)\\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\s*원(?:\\s|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAVER_PAY_CANCEL_RE = Pattern.compile("\\[?\\s*네이버\\s*페이\\s*\\]?\\s*((?:주문\\s*취소|결제\\s*취소|취소))\\s*안내\\s+(.+?)\\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\s*원(?:\\s|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern URL_RE = Pattern.compile("https?://\\S+|\\bnaver\\.me/\\S+", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPACE_RE = Pattern.compile("\\s+");
    private static final String[] SIGNAL_TERMS = {
        "승인", "결제", "사용", "체크", "카드", "출금", "이체", "송금", "입금", "취소", "환불", "간편결제", "페이"
    };
    private static final String[] HARD_IGNORE_TERMS = {
        "배송", "택배", "로그인", "인증번호", "otp", "보안알림"
    };
    private static final String[] SOFT_IGNORE_TERMS = {
        "광고", "혜택", "쿠폰", "이벤트", "프로모션"
    };
    private static final String[] FINANCE_PACKAGE_HINTS = {
        "bank", "card", "pay", "kakao", "toss", "hana", "shinhan", "kb", "woori", "lotte", "hyundai", "nh", "naver"
    };
    private static final String[] MESSAGE_PACKAGE_HINTS = {
        "messaging", "message", "sms", "mms", "문자", "메시지"
    };

    private PaymentNotificationParser() {}

    static String ignoredDebugText(Context context, StatusBarNotification sbn) {
        try {
            Notification notification = sbn == null ? null : sbn.getNotification();
            if (notification == null) return "";
            Bundle extras = notification.extras;
            String title = text(extras, Notification.EXTRA_TITLE);
            String text = text(extras, Notification.EXTRA_TEXT);
            String bigText = text(extras, Notification.EXTRA_BIG_TEXT);
            List<String> lines = textLines(extras);
            String messages = messagingText(extras);
            String ticker = notification.tickerText == null ? "" : notification.tickerText.toString();
            String packageName = sbn.getPackageName() == null ? "" : sbn.getPackageName();
            String appLabel = appLabel(context, packageName);
            String combined = normalize(join(title, text, bigText, TextUtils.join(" ", lines), messages, ticker));
            if (!shouldRecordIgnored(combined)) return "";
            String debug = normalize(join(packageName, appLabel, combined));
            return debug.length() > 220 ? debug.substring(0, 220).trim() : debug;
        } catch (Exception ignored) {
            return "";
        }
    }

    static JSONObject parse(Context context, StatusBarNotification sbn) throws Exception {
        Notification notification = sbn.getNotification();
        if (notification == null) return null;

        Bundle extras = notification.extras;
        String title = text(extras, Notification.EXTRA_TITLE);
        String text = text(extras, Notification.EXTRA_TEXT);
        String bigText = text(extras, Notification.EXTRA_BIG_TEXT);
        List<String> lines = textLines(extras);
        String messages = messagingText(extras);
        String ticker = notification.tickerText == null ? "" : notification.tickerText.toString();
        String appLabel = appLabel(context, sbn.getPackageName());
        String packageName = sbn.getPackageName() == null ? "" : sbn.getPackageName();
        return parseFields(
            context,
            packageName,
            appLabel,
            sbn.getKey(),
            sbn.getPostTime(),
            title,
            text,
            bigText,
            lines,
            messages,
            ticker,
            "android_local_notification"
        );
    }

    static JSONObject parseSms(Context context, long smsId, String address, String body, long dateMs) throws Exception {
        List<String> lines = new ArrayList<>();
        return parseFields(
            context,
            "android.provider.Telephony.SMS",
            "SMS",
            "sms:" + smsId,
            dateMs,
            address,
            body,
            body,
            lines,
            "",
            body,
            "android_local_sms"
        );
    }

    private static JSONObject parseFields(
        Context context,
        String packageName,
        String appLabel,
        String notificationKey,
        long postTime,
        String title,
        String text,
        String bigText,
        List<String> lines,
        String messages,
        String ticker,
        String source
    ) throws Exception {
        String combined = normalize(join(title, text, bigText, TextUtils.join(" ", lines), messages, ticker));
        NaverPayPayment naverPayPayment = parseNaverPayPayment(combined);

        if (naverPayPayment == null && !looksLikePaymentCandidate(packageName, appLabel, combined)) return null;
        int amount;
        String merchant;
        if (naverPayPayment != null) {
            amount = naverPayPayment.amount;
            merchant = naverPayPayment.merchant;
        } else {
            AmountHit amountHit = findAmount(combined);
            if (amountHit == null || amountHit.amount <= 0) return null;
            amount = amountHit.amount;
            merchant = extractMerchant(combined, amountHit, appLabel);
        }

        long occurredAt = parseOccurredAt(combined, postTime);
        String type = inferType(combined);
        double confidence = confidence(combined, merchant, packageName, appLabel);
        if (naverPayPayment != null) confidence = Math.max(confidence, 0.96);

        JSONObject out = new JSONObject();
        out.put("id", sha256(join(packageName, notificationKey, String.valueOf(postTime), combined)));
        out.put("schemaVersion", 1);
        out.put("status", "queued");
        out.put("type", type);
        out.put("amount", amount);
        out.put("merchant", merchant);
        out.put("occurredAt", iso(occurredAt));
        out.put("occurredAtMs", occurredAt);
        out.put("capturedAt", System.currentTimeMillis());
        out.put("postTime", postTime);
        out.put("packageName", packageName);
        out.put("appLabel", appLabel);
        out.put("notificationKey", notificationKey);
        out.put("title", title);
        out.put("text", text);
        out.put("bigText", bigText);
        out.put("lines", new JSONArray(lines));
        out.put("raw", combined);
        out.put("confidence", confidence);
        out.put("source", source == null || source.length() == 0 ? "android_local_notification" : source);
        if (naverPayPayment != null) {
            out.put("paymentRail", "naverpay");
            out.put("paymentRailResolved", true);
            out.put("actualMerchant", merchant);
            if (naverPayPayment.noticeType.equals("cancel")) {
                out.put("reason", "네이버페이 주문취소 문자");
            } else {
                out.put("reason", naverPayPayment.noticeType.equals("completed") ? "네이버페이 결제완료 문자" : "네이버페이 자동결제 문자");
            }
        }
        return out;
    }

    private static NaverPayPayment parseNaverPayPayment(String body) {
        String withoutUrls = normalize(URL_RE.matcher(body == null ? "" : body).replaceAll(" "));
        String normalized = withoutUrls.replace("[Web발신]", "").trim();
        Matcher cancelMatcher = NAVER_PAY_CANCEL_RE.matcher(normalized);
        if (cancelMatcher.find()) {
            int amount = parseAmount(cancelMatcher.group(3));
            String merchant = cleanMerchant(cancelMatcher.group(2));
            if (amount <= 0 || merchant.length() < 2) return null;
            return new NaverPayPayment(amount, merchant, "cancel");
        }
        Matcher matcher = NAVER_PAY_PAYMENT_RE.matcher(normalized);
        if (!matcher.find()) return null;
        int amount = parseAmount(matcher.group(3));
        String merchant = cleanMerchant(matcher.group(2));
        if (amount <= 0 || merchant.length() < 2) return null;
        String notice = normalize(matcher.group(1)).replace(" ", "");
        String noticeType = notice.contains("결제완료") ? "completed" : "auto";
        return new NaverPayPayment(amount, merchant, noticeType);
    }

    private static boolean looksLikePaymentCandidate(String packageName, String appLabel, String body) {
        String haystack = normalize(join(packageName, appLabel, body)).toLowerCase(Locale.ROOT);
        for (String ignore : HARD_IGNORE_TERMS) {
            if (haystack.contains(ignore)) return false;
        }
        boolean hasSignal = false;
        for (String term : SIGNAL_TERMS) {
            if (body.contains(term)) {
                hasSignal = true;
                break;
            }
        }
        boolean hasAmount = AMOUNT_RE.matcher(body).find();
        if (!hasAmount) return false;
        boolean strongBodySignal = body.matches(".*(승인|결제|출금|이체|송금|입금|취소|환불).*원.*")
            || body.matches(".*카드.*사용.*원.*")
            || body.matches(".*사용.*원.*(일시불|할부|누적|잔액|카드).*");
        boolean financePackage = false;
        for (String hint : FINANCE_PACKAGE_HINTS) {
            if (haystack.contains(hint)) {
                financePackage = true;
                break;
            }
        }
        boolean messagePackage = false;
        for (String hint : MESSAGE_PACKAGE_HINTS) {
            if (haystack.contains(hint)) {
                messagePackage = true;
                break;
            }
        }
        if (!strongBodySignal && !financePackage && !(messagePackage && hasSignal)) return false;
        if (!strongBodySignal) {
            for (String ignore : SOFT_IGNORE_TERMS) {
                if (haystack.contains(ignore)) return false;
            }
        }
        return true;
    }

    private static boolean shouldRecordIgnored(String body) {
        if (AMOUNT_RE.matcher(body).find()) return true;
        for (String term : SIGNAL_TERMS) {
            if (body.contains(term)) return true;
        }
        return false;
    }

    private static AmountHit findAmount(String body) {
        Matcher matcher = AMOUNT_RE.matcher(body);
        while (matcher.find()) {
            int amount = parseAmount(matcher.group(1));
            if (amount <= 0) continue;
            String before = body.substring(Math.max(0, matcher.start() - 14), matcher.start());
            if (isLabeledNonTransactionAmount(before)) {
                continue;
            }
            return new AmountHit(amount, matcher.start(), matcher.end());
        }
        return null;
    }

    private static boolean isLabeledNonTransactionAmount(String before) {
        String compact = normalize(before).replace(" ", "");
        return compact.matches(".*(잔액|잔고|누적|한도|포인트|적립|캐시)[-+]?\\s*$");
    }

    private static String inferType(String body) {
        if (body.contains("입금") || body.contains("환불") || body.contains("취소")) return "transfer_in";
        if (body.contains("출금") || body.contains("이체") || body.contains("송금")) return "transfer_out";
        return "card_payment";
    }

    private static String extractMerchant(String body, AmountHit amountHit, String appLabel) {
        String after = body.substring(Math.min(body.length(), amountHit.end)).trim();
        after = after.replaceFirst("^(승인|결제|사용|출금|이체|송금|일시불|할부|체크|신용|카드|완료|되었습니다)\\s*", "");
        after = after.replaceFirst("^\\d{1,2}[./-]\\d{1,2}\\s*\\d{1,2}:\\d{2}\\s*", "");
        after = after.replaceFirst("^\\d{1,2}:\\d{2}\\s*", "");
        String candidate = firstChunk(after);
        if (candidate.length() < 2) {
            String before = body.substring(0, Math.max(0, amountHit.start)).trim();
            candidate = lastChunk(before);
        }
        candidate = cleanMerchant(candidate);
        if (candidate.length() >= 2 && !candidate.matches(".*(승인|결제|출금|입금|잔액|누적).*")) {
            return candidate;
        }
        return cleanMerchant(appLabel);
    }

    private static String firstChunk(String text) {
        String[] chunks = text.split("[/\\n\\r]|잔액|잔고|누적|승인번호|이용금액|카드번호");
        return chunks.length == 0 ? "" : chunks[0];
    }

    private static String lastChunk(String text) {
        String[] chunks = text.split("[/\\n\\r]|\\s{2,}|\\(|\\)");
        for (int i = chunks.length - 1; i >= 0; i--) {
            String cleaned = cleanMerchant(chunks[i]);
            if (cleaned.length() >= 2) return cleaned;
        }
        return "";
    }

    private static String cleanMerchant(String value) {
        String cleaned = normalize(value)
            .replaceAll("^(\\[[^\\]]+\\]|\\([^\\)]+\\))", "")
            .replaceAll("^(승인|결제|사용|출금|이체|송금|체크|신용|일시불|할부|카드|알림)\\s*", "")
            .replaceAll("^\\d{1,2}[./-]\\d{1,2}\\s*\\d{1,2}:\\d{2}\\s*", "")
            .replaceAll("^\\d{1,2}:\\d{2}\\s*", "")
            .replaceAll("^[\"'“”‘’]+|[\"'“”‘’]+$", "")
            .replaceAll("(님|고객님)$", "")
            .trim();
        if (cleaned.length() > 40) cleaned = cleaned.substring(0, 40).trim();
        return cleaned;
    }

    private static long parseOccurredAt(String body, long fallback) {
        Matcher matcher = DATE_TIME_RE.matcher(body);
        if (!matcher.find()) return fallback;
        Calendar cal = Calendar.getInstance(TimeZone.getDefault(), Locale.KOREA);
        cal.setTimeInMillis(fallback);
        int year = cal.get(Calendar.YEAR);
        int month = intValue(matcher.group(1), cal.get(Calendar.MONTH) + 1);
        int day = intValue(matcher.group(2), cal.get(Calendar.DAY_OF_MONTH));
        int hour = intValue(matcher.group(3), cal.get(Calendar.HOUR_OF_DAY));
        int minute = intValue(matcher.group(4), cal.get(Calendar.MINUTE));
        cal.set(Calendar.YEAR, year);
        cal.set(Calendar.MONTH, Math.max(0, Math.min(11, month - 1)));
        cal.set(Calendar.DAY_OF_MONTH, Math.max(1, Math.min(31, day)));
        cal.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, hour)));
        cal.set(Calendar.MINUTE, Math.max(0, Math.min(59, minute)));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() - fallback > 7L * 24L * 60L * 60L * 1000L) {
            cal.add(Calendar.YEAR, -1);
        }
        return cal.getTimeInMillis();
    }

    private static double confidence(String body, String merchant, String packageName, String appLabel) {
        double score = 0.45;
        if (merchant != null && merchant.length() >= 2) score += 0.2;
        for (String term : SIGNAL_TERMS) {
            if (body.contains(term)) {
                score += 0.15;
                break;
            }
        }
        String lower = normalize(join(packageName, appLabel)).toLowerCase(Locale.ROOT);
        for (String hint : FINANCE_PACKAGE_HINTS) {
            if (lower.contains(hint)) {
                score += 0.1;
                break;
            }
        }
        for (String hint : MESSAGE_PACKAGE_HINTS) {
            if (lower.contains(hint)) {
                score += 0.1;
                break;
            }
        }
        return Math.min(0.95, score);
    }

    private static List<String> textLines(Bundle extras) {
        List<String> out = new ArrayList<>();
        if (extras == null) return out;
        CharSequence[] rows = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (rows == null) return out;
        for (CharSequence row : rows) {
            if (row != null) out.add(row.toString());
        }
        return out;
    }

    private static String messagingText(Bundle extras) {
        if (extras == null || Build.VERSION.SDK_INT < 24) return "";
        try {
            Parcelable[] raw = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (raw == null) return "";
            List<Notification.MessagingStyle.Message> messages = Notification.MessagingStyle.Message.getMessagesFromBundleArray(raw);
            List<String> rows = new ArrayList<>();
            if (messages != null) {
                for (Notification.MessagingStyle.Message message : messages) {
                    if (message != null && message.getText() != null) rows.add(message.getText().toString());
                }
            }
            return TextUtils.join(" ", rows);
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String text(Bundle extras, String key) {
        if (extras == null) return "";
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString();
    }

    private static String appLabel(Context context, String packageName) {
        try {
            PackageManager pm = context.getPackageManager();
            ApplicationInfo app = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(app);
            return label == null ? packageName : label.toString();
        } catch (Exception ignored) {
            return packageName == null ? "" : packageName;
        }
    }

    private static String normalize(String value) {
        return SPACE_RE.matcher(value == null ? "" : value).replaceAll(" ").trim();
    }

    private static String join(String... values) {
        List<String> rows = new ArrayList<>();
        for (String value : values) {
            String normalized = normalize(value);
            if (normalized.length() > 0 && !rows.contains(normalized)) rows.add(normalized);
        }
        return TextUtils.join(" ", rows);
    }

    private static int parseAmount(String value) {
        try {
            return Integer.parseInt(value.replace(",", ""));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static int intValue(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String iso(long timeMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.KOREA);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(timeMs));
    }

    private static String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(value.getBytes("UTF-8"));
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    private static final class AmountHit {
        final int amount;
        final int start;
        final int end;

        AmountHit(int amount, int start, int end) {
            this.amount = amount;
            this.start = start;
            this.end = end;
        }
    }

    private static final class NaverPayPayment {
        final int amount;
        final String merchant;
        final String noticeType;

        NaverPayPayment(int amount, String merchant, String noticeType) {
            this.amount = amount;
            this.merchant = merchant;
            this.noticeType = noticeType;
        }
    }
}
