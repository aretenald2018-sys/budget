package com.aretenald.budget;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Parcelable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class RunActivityImportStore {
    private static final String PREFS = "budget_run_activity_import_store";
    private static final String KEY_ROWS = "run_activity_imports";
    private static final String KEY_ACTIVE_UID = "active_uid";
    private static final int MAX_ROWS = 40;
    private static final int MAX_IMPORT_BYTES = 2 * 1024 * 1024;
    private static final Pattern GPX_POINT_RE = Pattern.compile("<trkpt\\s+([^>]*)>(.*?)</trkpt>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern XML_ATTR_RE = Pattern.compile("([A-Za-z_:][-A-Za-z0-9_:.]*)\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern TCX_POINT_RE = Pattern.compile("<Trackpoint>(.*?)</Trackpoint>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    private RunActivityImportStore() {}

    static synchronized int enqueueIntent(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return 0;
        String activeUid = activeUid(context);
        if (activeUid.length() == 0) {
            NotificationCaptureStore.recordIgnored(context, "run_import_no_user", "route import ignored until web login binds user");
            return 0;
        }
        Parcelable stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (!(stream instanceof Uri)) return 0;
        return enqueueUri(context, (Uri) stream, intent.getType(), activeUid) ? 1 : 0;
    }

    static synchronized void setActiveUid(Context context, String uid) {
        String value = safe(uid);
        if (value.length() == 0) prefs(context).edit().remove(KEY_ACTIVE_UID).apply();
        else prefs(context).edit().putString(KEY_ACTIVE_UID, value).apply();
    }

    static synchronized boolean hasActiveUid(Context context) {
        return activeUid(context).length() > 0;
    }

    static synchronized boolean enqueueRecordedActivity(Context context, JSONObject activity) {
        String uid = activeUid(context);
        if (uid.length() == 0 || activity == null) {
            NotificationCaptureStore.recordIgnored(context, "run_record_no_user", "native run ignored until web login binds user");
            return false;
        }
        return enqueueActivity(context, activity, uid);
    }

    static synchronized String listPendingJson(Context context, int max) {
        String uid = activeUid(context);
        if (uid.length() == 0) return "[]";
        JSONArray out = new JSONArray();
        JSONArray rows = readRows(context);
        int limit = Math.max(1, Math.min(max, 20));
        for (int i = 0; i < rows.length() && out.length() < limit; i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            if (!safe(uid).equals(row.optString("uid", ""))) continue;
            String status = row.optString("status", "queued");
            int attempts = row.optInt("attempts", 0);
            if ("queued".equals(status) || ("failed".equals(status) && attempts < 3)) out.put(row);
        }
        return out.toString();
    }

    static synchronized void ack(Context context, String id, String uid, String activityId) {
        removeRow(context, id, uid);
    }

    static synchronized void fail(Context context, String id, String uid, String message) {
        JSONArray rows = readRows(context);
        int index = indexOf(rows, id, uid);
        if (index < 0) return;
        JSONObject row = rows.optJSONObject(index);
        if (row == null) return;
        try {
            row.put("status", "failed");
            row.put("attempts", row.optInt("attempts", 0) + 1);
            row.put("lastError", safe(message));
            row.put("updatedAt", System.currentTimeMillis());
            rows.put(index, row);
            writeRows(context, trimRows(rows));
        } catch (Exception ignored) {
        }
    }

    static synchronized String statusJson(Context context) {
        JSONArray rows = readRows(context);
        int queued = 0;
        int failed = 0;
        int saved = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String status = row.optString("status", "queued");
            if ("queued".equals(status)) queued++;
            else if ("failed".equals(status)) failed++;
            else if ("saved".equals(status)) saved++;
        }
        JSONObject out = new JSONObject();
        try {
            out.put("available", true);
            out.put("queued", queued);
            out.put("failed", failed);
            out.put("saved", saved);
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    private static boolean enqueueUri(Context context, Uri uri, String intentMimeType, String uid) {
        try {
            String mimeType = safe(context.getContentResolver().getType(uri));
            if (mimeType.length() == 0) mimeType = safe(intentMimeType);
            if (!isAllowedRouteMime(mimeType)) return false;
            String content = readUriText(context, uri);
            JSONObject activity = parseActivity(content, safe(uri.getLastPathSegment()), mimeType);
            if (activity == null) return false;
            return enqueueActivity(context, activity, uid);
        } catch (Exception err) {
            NotificationCaptureStore.recordError(context, "run_import_failed", err.getClass().getSimpleName() + ": " + safe(err.getMessage()));
            return false;
        }
    }

    private static boolean enqueueActivity(Context context, JSONObject activity, String uid) {
        try {
            String id = "run_import_" + sha256(activity.toString()).substring(0, 24);
            JSONArray rows = readRows(context);
            int existing = indexOf(rows, id, uid);
            JSONObject row = new JSONObject();
            row.put("id", id);
            row.put("schemaVersion", 1);
            row.put("status", "queued");
            row.put("uid", uid);
            row.put("attempts", existing >= 0 ? rows.optJSONObject(existing).optInt("attempts", 0) : 0);
            row.put("activity", activity);
            row.put("capturedAt", System.currentTimeMillis());
            row.put("updatedAt", System.currentTimeMillis());
            if (existing >= 0) rows.put(existing, row);
            else rows.put(row);
            writeRows(context, trimRows(rows));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static JSONObject parseActivity(String content, String sourceName, String mimeType) throws Exception {
        String text = safe(content).trim();
        if (text.length() == 0) return null;
        if (text.startsWith("{") || text.startsWith("[")) return parseJsonActivity(text, sourceName);
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("<gpx")) return parseGpx(text, sourceName, mimeType);
        if (lower.contains("<trackpoint")) return parseTcx(text, sourceName, mimeType);
        return null;
    }

    private static JSONObject parseJsonActivity(String text, String sourceName) throws Exception {
        JSONObject activity;
        if (text.startsWith("[")) {
            activity = new JSONObject();
            activity.put("routePoints", new JSONArray(text));
        } else {
            activity = sanitizedJsonActivity(new JSONObject(text));
        }
        if (!hasValidJsonRoute(activity)) return null;
        activity.put("source", activity.optString("source", "android_route_import"));
        activity.put("provider", activity.optString("provider", "json"));
        activity.put("title", activity.optString("title", titleFromSource(sourceName)));
        activity.put("sourceActivityId", activity.optString("sourceActivityId", "android-json-" + sha256(text).substring(0, 24)));
        return activity;
    }

    private static JSONObject parseGpx(String text, String sourceName, String mimeType) throws Exception {
        JSONArray points = new JSONArray();
        Matcher matcher = GPX_POINT_RE.matcher(text);
        while (matcher.find() && points.length() < 20000) {
            String attrs = matcher.group(1);
            String lat = xmlAttr(attrs, "lat");
            String lng = xmlAttr(attrs, "lon");
            if (lat.length() == 0 || lng.length() == 0) continue;
            JSONObject point = new JSONObject();
            point.put("lat", Double.parseDouble(lat));
            point.put("lng", Double.parseDouble(lng));
            String body = matcher.group(2);
            putOptionalTag(point, body, "ele", "altitude");
            putOptionalTag(point, body, "time", "timestamp");
            points.put(point);
        }
        return routeActivity("gpx", text, sourceName, mimeType, points);
    }

    private static JSONObject parseTcx(String text, String sourceName, String mimeType) throws Exception {
        JSONArray points = new JSONArray();
        Matcher matcher = TCX_POINT_RE.matcher(text);
        while (matcher.find() && points.length() < 20000) {
            String body = matcher.group(1);
            String lat = tagText(body, "LatitudeDegrees");
            String lng = tagText(body, "LongitudeDegrees");
            if (lat.length() == 0 || lng.length() == 0) continue;
            JSONObject point = new JSONObject();
            point.put("lat", Double.parseDouble(lat));
            point.put("lng", Double.parseDouble(lng));
            putOptionalTag(point, body, "AltitudeMeters", "altitude");
            putOptionalTag(point, body, "Time", "timestamp");
            putOptionalTag(point, body, "DistanceMeters", "cumulativeMeters");
            points.put(point);
        }
        return routeActivity("tcx", text, sourceName, mimeType, points);
    }

    private static JSONObject routeActivity(String provider, String text, String sourceName, String mimeType, JSONArray points) throws Exception {
        if (points.length() < 3) return null;
        JSONObject gps = new JSONObject();
        gps.put("samples", points);
        JSONObject activity = new JSONObject();
        activity.put("source", "android_route_import");
        activity.put("provider", provider);
        activity.put("deviceSource", "android");
        activity.put("title", xmlText(firstTag(text, "name"), titleFromSource(sourceName)));
        activity.put("mimeType", safe(mimeType));
        activity.put("sourceActivityId", "android-" + provider + "-" + sha256(text).substring(0, 24));
        activity.put("gps", gps);
        JSONObject first = points.optJSONObject(0);
        JSONObject last = points.optJSONObject(points.length() - 1);
        if (first != null && first.optString("timestamp").length() > 0) activity.put("startedAt", first.optString("timestamp"));
        if (last != null && last.optString("timestamp").length() > 0) activity.put("endedAt", last.optString("timestamp"));
        return activity;
    }

    private static String readUriText(Context context, Uri uri) throws Exception {
        InputStream input = context.getContentResolver().openInputStream(uri);
        if (input == null) return "";
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_IMPORT_BYTES) throw new IllegalArgumentException("route import too large");
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            input.close();
        }
    }

    private static void updateStatus(Context context, String id, String status, String activityId, String message) {
        JSONArray rows = readRows(context);
        int index = indexOf(rows, id);
        if (index < 0) return;
        JSONObject row = rows.optJSONObject(index);
        if (row == null) return;
        try {
            row.put("status", status);
            row.put("activityId", safe(activityId));
            row.put("lastError", safe(message));
            row.put("updatedAt", System.currentTimeMillis());
            rows.put(index, row);
            writeRows(context, trimRows(rows));
        } catch (Exception ignored) {
        }
    }

    private static void removeRow(Context context, String id, String uid) {
        JSONArray rows = readRows(context);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && !(id.equals(row.optString("id")) && safe(uid).equals(row.optString("uid", "")))) kept.put(row);
        }
        writeRows(context, trimRows(kept));
    }

    private static JSONArray readRows(Context context) {
        try {
            return new JSONArray(context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ROWS, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void writeRows(Context context, JSONArray rows) {
        prefs(context).edit().putString(KEY_ROWS, rows.toString()).apply();
    }

    private static JSONArray trimRows(JSONArray rows) {
        JSONArray out = new JSONArray();
        int start = Math.max(0, rows.length() - MAX_ROWS);
        for (int i = rows.length() - 1; i >= start; i--) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) out.put(row);
        }
        return out;
    }

    private static int indexOf(JSONArray rows, String id) {
        return indexOf(rows, id, "");
    }

    private static int indexOf(JSONArray rows, String id, String uid) {
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null || !id.equals(row.optString("id"))) continue;
            if (uid.length() > 0 && !uid.equals(row.optString("uid", ""))) continue;
            return i;
        }
        return -1;
    }

    private static void putOptionalTag(JSONObject point, String body, String tag, String key) throws Exception {
        String value = tagText(body, tag);
        if (value.length() == 0) return;
        if ("timestamp".equals(key)) point.put(key, xmlText(value, ""));
        else point.put(key, Double.parseDouble(value));
    }

    private static String tagText(String body, String tag) {
        return firstTag(body, tag).trim();
    }

    private static String firstTag(String body, String tag) {
        Matcher matcher = Pattern.compile("<" + tag + "(?:\\s+[^>]*)?>(.*?)</" + tag + ">", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(body);
        return matcher.find() ? matcher.group(1) : "";
    }

    private static String xmlAttr(String attrs, String name) {
        Matcher matcher = XML_ATTR_RE.matcher(safe(attrs));
        while (matcher.find()) {
            if (name.equalsIgnoreCase(matcher.group(1))) return matcher.group(2);
        }
        return "";
    }

    private static JSONObject sanitizedJsonActivity(JSONObject input) throws Exception {
        JSONObject out = new JSONObject();
        for (String key : new String[] {
            "id", "sourceActivityId", "externalId", "providerActivityId", "workoutId",
            "title", "name", "activityName", "source", "provider", "deviceSource",
            "startedAt", "startTime", "startDate", "endedAt", "endTime", "endDate",
            "durationSeconds", "durationMs", "distanceMeters", "distanceKm",
            "calories", "caloriesKcal", "averageHeartRate", "avgHeartRate", "cadence", "cadenceSpm", "elevationGainMeters"
        }) {
            if (input.has(key)) out.put(key, input.get(key));
        }
        copyRouteArray(input, out, "routePoints");
        copyRouteArray(input, out, "locations");
        copyRouteArray(input, out, "samples");
        copyRouteArray(input, out, "path");
        copyRouteArray(input, out, "coordinates");
        if (input.optJSONObject("gps") != null) {
            JSONObject gps = new JSONObject();
            JSONObject inputGps = input.optJSONObject("gps");
            copyRouteArray(inputGps, gps, "samples");
            copyRouteArray(inputGps, gps, "locations");
            copyRouteArray(inputGps, gps, "points");
            copyRouteArray(inputGps, gps, "path");
            if (gps.length() > 0) out.put("gps", gps);
        }
        if (input.optJSONObject("route") != null) {
            JSONObject route = new JSONObject();
            JSONObject inputRoute = input.optJSONObject("route");
            copyRouteArray(inputRoute, route, "locations");
            copyRouteArray(inputRoute, route, "points");
            copyRouteArray(inputRoute, route, "coordinates");
            copyRouteArray(inputRoute, route, "path");
            if (route.length() > 0) out.put("route", route);
        }
        if (input.optJSONObject("workoutRoute") != null) {
            JSONObject workoutRoute = new JSONObject();
            JSONObject inputWorkoutRoute = input.optJSONObject("workoutRoute");
            copyRouteArray(inputWorkoutRoute, workoutRoute, "locations");
            if (workoutRoute.length() > 0) out.put("workoutRoute", workoutRoute);
        }
        if (input.optJSONObject("health") != null && input.optJSONObject("health").optJSONObject("route") != null) {
            JSONObject health = new JSONObject();
            JSONObject route = new JSONObject();
            JSONObject inputHealthRoute = input.optJSONObject("health").optJSONObject("route");
            copyRouteArray(inputHealthRoute, route, "locations");
            if (route.length() > 0) {
                health.put("route", route);
                out.put("health", health);
            }
        }
        return out;
    }

    private static void copyRouteArray(JSONObject from, JSONObject to, String key) throws Exception {
        if (from != null && from.optJSONArray(key) != null) to.put(key, from.optJSONArray(key));
    }

    private static boolean hasValidJsonRoute(JSONObject activity) {
        return validRoutePointCount(activity.optJSONArray("routePoints")) >= 3
            || validRoutePointCount(activity.optJSONArray("locations")) >= 3
            || validRoutePointCount(activity.optJSONArray("samples")) >= 3
            || validRoutePointCount(activity.optJSONArray("path")) >= 3
            || validRoutePointCount(activity.optJSONArray("coordinates")) >= 3
            || validRoutePointCount(activity.optJSONObject("gps") == null ? null : activity.optJSONObject("gps").optJSONArray("samples")) >= 3
            || validRoutePointCount(activity.optJSONObject("gps") == null ? null : activity.optJSONObject("gps").optJSONArray("locations")) >= 3
            || validRoutePointCount(activity.optJSONObject("gps") == null ? null : activity.optJSONObject("gps").optJSONArray("points")) >= 3
            || validRoutePointCount(activity.optJSONObject("gps") == null ? null : activity.optJSONObject("gps").optJSONArray("path")) >= 3
            || validRoutePointCount(activity.optJSONObject("route") == null ? null : activity.optJSONObject("route").optJSONArray("locations")) >= 3
            || validRoutePointCount(activity.optJSONObject("route") == null ? null : activity.optJSONObject("route").optJSONArray("points")) >= 3
            || validRoutePointCount(activity.optJSONObject("route") == null ? null : activity.optJSONObject("route").optJSONArray("coordinates")) >= 3
            || validRoutePointCount(activity.optJSONObject("route") == null ? null : activity.optJSONObject("route").optJSONArray("path")) >= 3
            || validRoutePointCount(activity.optJSONObject("workoutRoute") == null ? null : activity.optJSONObject("workoutRoute").optJSONArray("locations")) >= 3
            || validRoutePointCount(activity.optJSONObject("health") == null || activity.optJSONObject("health").optJSONObject("route") == null ? null : activity.optJSONObject("health").optJSONObject("route").optJSONArray("locations")) >= 3;
    }

    private static int validRoutePointCount(JSONArray value) {
        if (value == null) return 0;
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            if (isValidRoutePoint(value.opt(i))) count++;
        }
        return count;
    }

    private static boolean isValidRoutePoint(Object value) {
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            if (array.length() < 2) return false;
            return isValidLatLng(array.optDouble(0, Double.NaN), array.optDouble(1, Double.NaN))
                || isValidLatLng(array.optDouble(1, Double.NaN), array.optDouble(0, Double.NaN));
        }
        if (!(value instanceof JSONObject)) return false;
        JSONObject point = (JSONObject) value;
        double lat = firstDouble(point, "lat", "latitude", "y");
        double lng = firstDouble(point, "lng", "lon", "long", "longitude", "x");
        if (!isValidLatLng(lat, lng)) {
            double latE7 = firstDouble(point, "latE7", "latitudeE7");
            double lngE7 = firstDouble(point, "lngE7", "lonE7", "longitudeE7");
            lat = latE7 / 10000000d;
            lng = lngE7 / 10000000d;
        }
        return isValidLatLng(lat, lng);
    }

    private static double firstDouble(JSONObject object, String... keys) {
        for (String key : keys) {
            if (!object.has(key)) continue;
            double value = object.optDouble(key, Double.NaN);
            if (!Double.isNaN(value) && !Double.isInfinite(value)) return value;
        }
        return Double.NaN;
    }

    private static boolean isValidLatLng(double lat, double lng) {
        return !Double.isNaN(lat)
            && !Double.isInfinite(lat)
            && !Double.isNaN(lng)
            && !Double.isInfinite(lng)
            && Math.abs(lat) <= 90d
            && Math.abs(lng) <= 180d;
    }

    private static boolean isAllowedRouteMime(String mimeType) {
        String value = safe(mimeType).toLowerCase(Locale.ROOT);
        return value.equals("application/gpx+xml")
            || value.equals("application/vnd.garmin.tcx+xml")
            || value.equals("application/json")
            || value.equals("application/xml")
            || value.equals("application/octet-stream")
            || value.equals("text/xml");
    }

    private static String activeUid(Context context) {
        return safe(prefs(context).getString(KEY_ACTIVE_UID, ""));
    }

    private static android.content.SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String titleFromSource(String sourceName) {
        String value = safe(sourceName);
        int slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf(':'));
        if (slash >= 0 && slash < value.length() - 1) value = value.substring(slash + 1);
        return value.length() == 0 ? "러닝 가져오기" : value;
    }

    private static String xmlText(String value, String fallback) {
        String text = safe(value).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").trim();
        return text.length() == 0 ? fallback : text;
    }

    private static String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(safe(value).getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return out.toString();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
