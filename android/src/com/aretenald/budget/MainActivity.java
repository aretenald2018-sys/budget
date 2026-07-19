package com.aretenald.budget;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayDeque;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://aretenald2018-sys.github.io/budget/";
    private static final String APP_HOST = "aretenald2018-sys.github.io";
    private static final String APP_PATH_PREFIX = "/budget/";
    private static final String EXTRA_ENTRY = "entry";
    private WebView webView;
    private final ArrayDeque<String> pendingEntries = new ArrayDeque<>();
    private boolean appPageReady;
    private boolean entryDeliveryInFlight;
    private int pageGeneration;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(Color.parseColor("#0a0a0a"));
            getWindow().setNavigationBarColor(Color.parseColor("#0a0a0a"));
        }

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new BudgetWebViewClient());
        NativeHooks.attach(webView, this);
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            }
        });

        setContentView(webView);
        queueEntry(entryForIntent(getIntent()));
        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            if (webView.restoreState(savedInstanceState) == null) {
                webView.loadUrl(APP_URL);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        queueEntry(entryForIntent(intent));
        deliverPendingEntry();
    }

    @Override
    protected void onResume() {
        super.onResume();
        SmsCaptureScanner.scanRecent(this, 80, 3 * 24 * 60);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (SmsCaptureScanner.isReadPermissionRequest(requestCode)) {
            SmsCaptureScanner.scanRecent(this, 80, 3 * 24 * 60);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private String entryForIntent(Intent intent) {
        if (intent == null) return "";
        String explicitEntry = normalizeEntry(intent.getStringExtra(EXTRA_ENTRY));
        if (!explicitEntry.isEmpty()) return explicitEntry;

        Uri uri = intent.getData();
        if (uri != null && "tomatobudget".equals(uri.getScheme())) {
            String host = uri.getHost();
            String path = uri.getPath();
            if ("spending".equals(host) && "/month".equals(path)) {
                return "spending";
            }
            if ("wine".equals(host) && "/recent".equals(path)) {
                return "wine";
            }
        }
        return "";
    }

    private static String normalizeEntry(String value) {
        if ("spending".equals(value) || "wine".equals(value) || "points".equals(value)) return value;
        return "";
    }

    private void queueEntry(String entry) {
        String normalized = normalizeEntry(entry);
        if (!normalized.isEmpty()) pendingEntries.addLast(normalized);
    }

    private void deliverPendingEntry() {
        if (webView == null || !appPageReady || entryDeliveryInFlight || pendingEntries.isEmpty()) return;
        final String entry = pendingEntries.peekFirst();
        final int deliveryGeneration = pageGeneration;
        final String script = "(function(entry){try{"
            + "if(typeof window.receiveBudgetNativeEntry==='function'){"
            + "return window.receiveBudgetNativeEntry(entry)!==false;}"
            + "var queued=Array.isArray(window.__budgetNativeEntries)?window.__budgetNativeEntries:[];"
            + "queued.push(entry);window.__budgetNativeEntries=queued;return true;"
            + "}catch(error){return false;}})(" + JSONObject.quote(entry) + ");";
        entryDeliveryInFlight = true;
        webView.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (deliveryGeneration != pageGeneration) return;
                entryDeliveryInFlight = false;
                if ("true".equals(value) && entry.equals(pendingEntries.peekFirst())) {
                    pendingEntries.removeFirst();
                    deliverPendingEntry();
                }
            }
        });
    }

    private static boolean isAppPage(Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(APP_PATH_PREFIX);
    }

    private class BudgetWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pageGeneration += 1;
            appPageReady = false;
            entryDeliveryInFlight = false;
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            appPageReady = isAppPage(url == null ? null : Uri.parse(url));
            if (appPageReady) deliverPendingEntry();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(view, request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(view, Uri.parse(url));
        }

        private boolean handleUrl(WebView view, Uri uri) {
            if (uri == null) return false;
            String scheme = uri.getScheme();
            String host = uri.getHost();
            String path = uri.getPath();
            if ("https".equals(scheme) && APP_HOST.equals(host) && path != null && path.startsWith(APP_PATH_PREFIX)) {
                return false;
            }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                view.getContext().startActivity(intent);
            } catch (Exception ignored) {
                return true;
            }
            return true;
        }
    }

}
