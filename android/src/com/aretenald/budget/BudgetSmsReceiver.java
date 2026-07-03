package com.aretenald.budget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONArray;

import java.util.Locale;

public class BudgetSmsReceiver extends BroadcastReceiver {
    private static final String SMS_PACKAGE = "android.provider.Telephony";

    private static final String[] FINANCE_MARKERS = {
        "hana", "하나", "keb", "toss", "토스", "viva", "naver", "네이버", "kakao", "카카오",
        "shinhan", "신한", "woori", "우리", "kookmin", "국민", "kb", "lotte", "롯데",
        "hyundai", "현대", "samsung", "삼성", "bccard", "bc카드", "nonghyup", "농협",
        "ibk", "기업", "kbank", "케이뱅크", "payco", "페이코", "card", "카드",
        "bank", "은행", "pay", "페이"
    };

    private static final String[] PAYMENT_MARKERS = {
        "결제", "승인", "승인취소", "취소", "이용", "사용", "구매", "출금", "입금",
        "송금", "이체", "체크", "체크카드", "신용", "신용카드", "일시불", "할부",
        "잔액", "자동납부", "납부", "환불", "캐시백"
    };

    private static final String[] CARD_SMS_SOURCE_MARKERS = {
        "[web발신]", "web발신", "[web 발신]", "무료수신"
    };

    private static final String[] NOISE_MARKERS = {
        "인증번호", "본인확인", "로그인", "광고", "쿠폰", "혜택", "이벤트", "배송", "택배"
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;

        SmsMessage[] messages;
        try {
            messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        } catch (Exception ignored) {
            return;
        }
        if (messages == null || messages.length == 0) return;

        String sender = "";
        StringBuilder body = new StringBuilder();
        long postTime = 0;
        for (SmsMessage message : messages) {
            if (message == null) continue;
            if (sender.length() == 0) sender = safe(message.getDisplayOriginatingAddress());
            String part = safe(message.getMessageBody()).trim();
            if (part.length() > 0) {
                if (body.length() > 0) body.append('\n');
                body.append(part);
            }
            if (message.getTimestampMillis() > 0 && (postTime == 0 || message.getTimestampMillis() < postTime)) {
                postTime = message.getTimestampMillis();
            }
        }

        String text = body.toString().trim();
        if (!isPaymentCandidate(sender, text)) return;

        long capturedAt = System.currentTimeMillis();
        long receivedAt = postTime > 0 ? postTime : capturedAt;
        String id = makeId(sender, receivedAt, text);
        NativeIngestClient.NativePayload payload = new NativeIngestClient.NativePayload(
            id,
            SMS_PACKAGE,
            "SMS",
            sender,
            text,
            "",
            new JSONArray(),
            receivedAt,
            capturedAt,
            "sms",
            "sms",
            "android_sms_receiver"
        );
        final Context appContext = context.getApplicationContext();
        final BroadcastReceiver.PendingResult pendingResult = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    NativeIngestClient.enqueueAndSendNow(appContext, payload);
                } finally {
                    pendingResult.finish();
                }
            }
        }, "BudgetSmsIngest").start();
    }

    private static boolean isPaymentCandidate(String sender, String body) {
        String text = (safe(sender) + "\n" + safe(body)).trim();
        if (text.length() == 0) return false;

        boolean hasPaymentMarker = containsAny(text, PAYMENT_MARKERS);
        boolean hasFinancialMarker = containsAny(text, FINANCE_MARKERS);
        boolean hasAmount = hasMoneyAmount(text);
        boolean hasCardShape = isCardSmsPaymentBody(text);
        if (!hasPaymentMarker && !hasFinancialMarker && !hasAmount && !hasCardShape) return false;

        boolean hasNoiseMarker = containsAny(text, NOISE_MARKERS);
        if (hasNoiseMarker && !hasPaymentMarker && !hasFinancialMarker && !hasCardShape) return false;
        return true;
    }

    private static boolean isCardSmsPaymentBody(String value) {
        String text = safe(value).toLowerCase(Locale.ROOT).replace('\n', ' ');
        boolean hasSmsMarker = containsAny(text, CARD_SMS_SOURCE_MARKERS);
        boolean hasCardApprovalShape = text.matches("(?s).*[가-힣a-z]+[0-9*]{2,}\\s*(승인|취소).*?[0-9,]+\\s*(원|krw).*?(일시불|할부|체크)?.*");
        boolean hasAccumulatedUsage = text.contains("누적이용금액") || text.matches("(?s).*누적\\s*[0-9,]+\\s*원.*");
        return (hasSmsMarker || hasAccumulatedUsage) && hasCardApprovalShape;
    }

    private static boolean hasMoneyAmount(String value) {
        String text = safe(value).toLowerCase(Locale.ROOT);
        return text.matches("(?s).*\\d[\\d,]*\\s*(원|만원|krw).*")
            || text.matches("(?s).*₩\\s*\\d[\\d,]*.*");
    }

    private static boolean containsAny(String value, String[] markers) {
        String text = safe(value).toLowerCase(Locale.ROOT);
        for (String marker : markers) {
            if (text.contains(marker.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private static String makeId(String sender, long receivedAt, String body) {
        String base = safe(sender) + "|" + receivedAt + "|" + safe(body);
        return "sms:" + safe(sender) + ":" + receivedAt + ":" + Integer.toHexString(base.hashCode());
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
