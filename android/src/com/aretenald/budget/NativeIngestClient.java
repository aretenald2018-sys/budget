package com.aretenald.budget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

final class NativeIngestClient {
    private static final int CONNECT_TIMEOUT_MS = 9000;
    private static final int READ_TIMEOUT_MS = 16000;
    private static final int RESPONSE_SNIPPET_LIMIT = 240;

    private NativeIngestClient() {}

    static void enqueueAndSendAsync(Context context, NativePayload payload) {
        if (context == null || payload == null) return;
        Context appContext = context.getApplicationContext();
        String currentStatus = NativeIngestStore.statusFor(appContext, payload.id);
        if ("sent".equals(currentStatus) || "queued".equals(currentStatus) || "failed".equals(currentStatus)) {
            return;
        }
        NativeIngestStore.recordQueued(appContext, payload, "captured");
        sendAsync(appContext, payload);
    }

    static void flushAsync(Context context) {
        if (context == null) return;
        Context appContext = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<NativePayload> rows = NativeIngestStore.pendingPayloads(appContext);
                for (NativePayload payload : rows) {
                    sendNow(appContext, payload);
                }
            }
        }, "BudgetNativeIngestFlush").start();
    }

    private static void sendAsync(final Context context, final NativePayload payload) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                sendNow(context, payload);
            }
        }, "BudgetNativeIngestSend").start();
    }

    private static void sendNow(Context context, NativePayload payload) {
        String token = NativeIngestStore.getToken(context);
        if (token.length() == 0) {
            NativeIngestStore.recordQueued(context, payload, "ingest token missing");
            return;
        }

        HttpURLConnection conn = null;
        int status = 0;
        try {
            URL url = new URL(NativeIngestStore.getApiUrl(context));
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);

            OutputStream os = conn.getOutputStream();
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(os, "UTF-8"));
            writer.write(payload.toIngestJson().toString());
            writer.flush();
            writer.close();
            os.close();

            status = conn.getResponseCode();
            String response = readResponse(conn, status);
            if (status >= 200 && status < 300) {
                NativeIngestStore.recordSent(context, payload, status, snippet(response));
            } else {
                NativeIngestStore.recordFailed(context, payload, status, snippet(response));
            }
        } catch (Exception err) {
            NativeIngestStore.recordFailed(context, payload, status, err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readResponse(HttpURLConnection conn, int status) {
        InputStream stream = null;
        try {
            stream = status >= 200 && status < 400 ? conn.getInputStream() : conn.getErrorStream();
            if (stream == null) return "";
            BufferedReader reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
            StringBuilder out = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (out.length() > 0) out.append('\n');
                out.append(line);
                if (out.length() >= RESPONSE_SNIPPET_LIMIT) break;
            }
            reader.close();
            return out.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String snippet(String value) {
        String text = safe(value).replace('\n', ' ').trim();
        if (text.length() <= RESPONSE_SNIPPET_LIMIT) return text;
        return text.substring(0, RESPONSE_SNIPPET_LIMIT);
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String isoTime(long timeMs) {
        long value = timeMs > 0 ? timeMs : System.currentTimeMillis();
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(value));
    }

    static final class NativePayload {
        final String id;
        final String packageName;
        final String appLabel;
        final String title;
        final String text;
        final String bigText;
        final JSONArray textLines;
        final long postTime;
        final long capturedAt;

        NativePayload(
            String id,
            String packageName,
            String appLabel,
            String title,
            String text,
            String bigText,
            JSONArray textLines,
            long postTime,
            long capturedAt
        ) {
            this.id = safe(id);
            this.packageName = safe(packageName);
            this.appLabel = safe(appLabel);
            this.title = safe(title);
            this.text = safe(text);
            this.bigText = safe(bigText);
            this.textLines = textLines == null ? new JSONArray() : textLines;
            this.postTime = postTime;
            this.capturedAt = capturedAt;
        }

        JSONObject toIngestJson() {
            JSONObject meta = new JSONObject();
            JSONObject out = new JSONObject();
            try {
                meta.put("nativeIngest", true);
                meta.put("ingestOrigin", "android_native");
                meta.put("ingestChannel", "notification");
                meta.put("ingestClient", "android_notification_listener");
                meta.put("ingestTraceId", id);
                meta.put("notificationId", id);
                meta.put("packageName", packageName);
                meta.put("appLabel", appLabel);
                meta.put("title", title);
                meta.put("text", text);
                meta.put("bigText", bigText);
                meta.put("textLines", textLines);
                meta.put("postTime", postTime);
                meta.put("capturedAt", capturedAt);

                out.put("source", "native_notification");
                out.put("ingestOrigin", "android_native");
                out.put("ingestChannel", "notification");
                out.put("ingestClient", "android_notification_listener");
                out.put("ingestTraceId", id);
                out.put("sender", title.length() > 0 ? title : appLabel);
                out.put("app", packageName);
                out.put("body", body());
                out.put("receivedAt", isoTime(postTime));
                out.put("meta", meta);
            } catch (JSONException ignored) {
            }
            return out;
        }

        JSONObject toStoreJson() {
            JSONObject out = new JSONObject();
            try {
                out.put("id", id);
                out.put("packageName", packageName);
                out.put("appLabel", appLabel);
                out.put("title", title);
                out.put("text", text);
                out.put("bigText", bigText);
                out.put("textLines", textLines);
                out.put("postTime", postTime);
                out.put("capturedAt", capturedAt);
            } catch (JSONException ignored) {
            }
            return out;
        }

        JSONObject toLogJson(String status, int httpStatus, String message) {
            JSONObject out = new JSONObject();
            try {
                out.put("id", id);
                out.put("status", status);
                out.put("httpStatus", httpStatus);
                out.put("message", safe(message));
                out.put("updatedAt", System.currentTimeMillis());
                out.put("appLabel", appLabel);
                out.put("packageName", packageName);
                out.put("preview", preview());
                out.put("attempts", "failed".equals(status) ? 1 : 0);
                out.put("payload", toStoreJson());
            } catch (JSONException ignored) {
            }
            return out;
        }

        String body() {
            StringBuilder out = new StringBuilder();
            appendPart(out, title);
            appendPart(out, text);
            appendPart(out, bigText);
            for (int i = 0; i < textLines.length(); i++) {
                appendPart(out, textLines.optString(i, ""));
            }
            return out.toString().trim();
        }

        String preview() {
            String body = body();
            if (body.length() <= 80) return body;
            return body.substring(0, 80);
        }

        static NativePayload fromJson(JSONObject json) {
            if (json == null) return null;
            return new NativePayload(
                json.optString("id", ""),
                json.optString("packageName", ""),
                json.optString("appLabel", ""),
                json.optString("title", ""),
                json.optString("text", ""),
                json.optString("bigText", ""),
                json.optJSONArray("textLines"),
                json.optLong("postTime", 0),
                json.optLong("capturedAt", 0)
            );
        }

        private static void appendPart(StringBuilder out, String value) {
            String text = safe(value).trim();
            if (text.length() == 0) return;
            if (out.length() > 0) out.append('\n');
            out.append(text);
        }
    }
}
