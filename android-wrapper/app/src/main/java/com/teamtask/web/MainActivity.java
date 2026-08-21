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
import android.app.ActivityManager;
import android.graphics.Color;

public class MainActivity extends Activity {
    public static final String SITE = NotifyHelper.SITE;
    private static final int REQ_NOTIFY = 1001;
    private static final int REQ_FILE = 1002;
    private WebView webView;
    private ProgressBar progress;
    private TextView errorView;
    private boolean lastLoadFailed;
    private boolean askedNotify;
    private boolean askedBattery;
    private ValueCallback<Uri[]> filePathCallback;
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

            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
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
                syncTokenFromWeb(view);
                // AsyncStorage may land after first paint — retry a few times
                poll.postDelayed(() -> syncTokenFromWeb(webView), 1500);
                poll.postDelayed(() -> syncTokenFromWeb(webView), 4000);
                poll.postDelayed(() -> syncTokenFromWeb(webView), 8000);
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

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void syncTokenFromWeb(WebView view) {
        if (view == null) return;
        view.evaluateJavascript(
            "(function(){try{"
                + "var t=localStorage.getItem('teamtask_token')"
                + "||localStorage.getItem('token')"
                + "||localStorage.getItem('@AsyncStorage:token');"
                + "if(t)return t;"
                + "for(var i=0;i<localStorage.length;i++){"
                + "var k=localStorage.key(i);"
                + "if(!k)continue;"
                + "if(k==='token'||k.indexOf('token')>=0||k.indexOf('AsyncStorage')>=0){"
                + "var v=localStorage.getItem(k);"
                + "if(v&&v.length>20&&v.indexOf('eyJ')>=0)return v;"
                + "}}"
                + "return '';"
                + "}catch(e){return '';}})()",
            (ValueCallback<String>) value -> {
                if (value == null || "null".equals(value) || "\"\"".equals(value)) return;
                String tok = value;
                if (tok.length() >= 2 && tok.charAt(0) == '"') {
                    tok = tok.substring(1, tok.length() - 1);
                }
                tok = tok.replace("\\\"", "\"").replace("\\/", "/").trim();
                if (!tok.isEmpty() && !"undefined".equals(tok)) {
                    NotifyHelper.saveToken(MainActivity.this, tok);
                }
            }
        );
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
        public void setAppLogo(String url) {
            if (url == null || url.isEmpty()) return;
            new Thread(() -> {
                try {
                    java.net.URL u = new java.net.URL(url);
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(12000);
                    Bitmap bmp = android.graphics.BitmapFactory.decodeStream(c.getInputStream());
                    c.disconnect();
                    if (bmp == null) return;
                    final Bitmap icon = Bitmap.createScaledBitmap(bmp, 192, 192, true);
                    if (bmp != icon) bmp.recycle();
                    runOnUiThread(() -> {
                        try {
                            if (Build.VERSION.SDK_INT >= 21) {
                                setTaskDescription(new ActivityManager.TaskDescription(
                                    "TeamTask",
                                    icon,
                                    Color.parseColor("#0F1C17")
                                ));
                            }
                        } catch (Exception ignored) {
                        }
                    });
                } catch (Exception ignored) {
                }
            }, "teamtask-logo").start();
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
        // SPA: WebView history is usually empty — ask React Navigation first.
        webView.evaluateJavascript(
            "(function(){try{"
                + "if(window.TeamTaskNav&&window.TeamTaskNav.canGoBack&&window.TeamTaskNav.canGoBack()){"
                + "window.TeamTaskNav.goBack();return '1';}"
                + "return '0';"
                + "}catch(e){return '0';}})()",
            value -> {
                boolean handled = value != null && value.contains("1");
                if (handled) return;
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // Stay in app (background) instead of finishing on root screen
                    moveTaskToBack(true);
                }
            }
        );
    }
}
