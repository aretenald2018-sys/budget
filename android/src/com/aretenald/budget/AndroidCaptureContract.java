package com.aretenald.budget;

final class AndroidCaptureContract {
    static final int SCHEMA_VERSION = 1;
    static final int MAX_ATTEMPTS = 3;
    static final long[] RETRY_DELAYS_MS = { 30_000L, 120_000L, 600_000L };
    static final String SOURCE_NOTIFICATION = "android_local_notification";
    static final String SOURCE_SMS = "android_local_sms";

    private AndroidCaptureContract() {}

    static boolean isTerminalStatus(String status) {
        return "saved".equals(status) || "duplicate".equals(status) || "merged".equals(status);
    }

    static String normalizedAckStatus(String action) {
        return isTerminalStatus(action) ? action : "saved";
    }

    static long retryDelayMs(int attempts) {
        int index = Math.max(0, Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1));
        return RETRY_DELAYS_MS[index];
    }
}
