package com.teamtask.web;

import android.annotation.SuppressLint;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;

import android.app.Activity;

public class MainActivity extends Activity {
    public static final String SITE = NotifyHelper.SITE;
    private static final int REQ_NOTIFY = 1001;
    private WebView webView;
    private ProgressBar progress;
    private TextView errorView;
    private boolean lastLoadFailed;
    private boolean askedNotify;
    private boolean askedBattery;
    private final Handler poll = new Handler(Looper.getMainLooper());
    private final Runnable pollRun = new Runnable() {
        @Override
        public void run() {
            new Thread(() -> NotifyHelper.pullAndPost(getApplicationContext()), "teamtask-poll").start();
            poll.postDelayed(this, 12_000);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        NotifyHelper.ensureChannel(this);
        NotifyHelper.ensureKeepAliveChannel(this);
        askNotifyPermission();
        askIgnoreBattery();
        NotifyHelper.schedule(this);
        NotifyHelper.scheduleAlarm(this);
        if (!NotifyHelper.token(this).isEmpty()) {
            NotifyPollService.start(this);
        }

        webView = findViewById(R.id.webview);
        progress = findViewById(R.id.progress);
        errorView = findViewById(R.id.error);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new NotifyBridge(), "TeamTaskNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
                progress.setProgress(newProgress);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && host.endsWith("tt.exodevs.com")) {
                    return false;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                lastLoadFailed = false;
                errorView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // RN AsyncStorage on web + our teamtask_token key
                view.evaluateJavascript(
                    "(function(){try{"
                        + "var t=localStorage.getItem('teamtask_token')"
                        + "||localStorage.getItem('token')"
                        + "||localStorage.getItem('@AsyncStorage:token')"
                        + "||'';"
                        + "return t||'';"
                        + "}catch(e){return '';}})()",
                    (ValueCallback<String>) value -> {
                        if (value == null || "null".equals(value) || "\"\"".equals(value)) return;
                        String tok = value.replace("\"", "").trim();
                        if (!tok.isEmpty() && !"undefined".equals(tok)) {
                            NotifyHelper.saveToken(MainActivity.this, tok);
                        }
                    }
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    lastLoadFailed = true;
                    webView.setVisibility(View.GONE);
                    errorView.setVisibility(View.VISIBLE);
                    errorView.setText("Can't reach TeamTask.\nCheck internet, then tap to retry.");
                }
            }
        });

        errorView.setOnClickListener(v -> webView.loadUrl(SITE));
        webView.loadUrl(SITE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        NotifyHelper.ensureChannel(this);
        NotifyHelper.scheduleAlarm(this);
        if (!NotifyHelper.token(this).isEmpty()) {
            NotifyPollService.start(this);
        }
        poll.removeCallbacks(pollRun);
        poll.post(pollRun);
    }

    @Override
    protected void onPause() {
        poll.removeCallbacks(pollRun);
        NotifyHelper.schedule(this);
        NotifyHelper.scheduleAlarm(this);
        if (!NotifyHelper.token(this).isEmpty()) {
            NotifyPollService.start(this);
        }
        super.onPause();
    }

    private void askNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (askedNotify) return;
        askedNotify = true;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
    }

    private void askIgnoreBattery() {
        if (askedBattery || Build.VERSION.SDK_INT < 23) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        if (pm.isIgnoringBatteryOptimizations(getPackageName())) return;
        askedBattery = true;
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored2) {
            }
        }
    }

    public class NotifyBridge {
        @JavascriptInterface
        public void setAuthToken(String token) {
            NotifyHelper.saveToken(getApplicationContext(), token);
        }

        @JavascriptInterface
        public void notify(String title, String body) {
            NotifyHelper.post(getApplicationContext(), "", title, body);
        }

        @JavascriptInterface
        public void push(String id, String title, String body) {
            NotifyHelper.post(getApplicationContext(), id, title, body);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
