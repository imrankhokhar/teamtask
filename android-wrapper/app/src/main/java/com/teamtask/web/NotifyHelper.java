package com.teamtask.web;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class NotifyHelper {
    static final String SITE = "https://tt.exodevs.com/";
    // New channel id — Xiaomi keeps old disabled channels forever.
    static final String CHANNEL_ID = "teamtask_alerts_v2";
    static final String KEEP_ALIVE_CHANNEL = "teamtask_keepalive_v2";
    private static final String PREFS = "teamtask";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_SEEN = "seen";
    private static final String KEY_TESTED = "tested_v2";
    private static final String TAG = "TeamTaskNotify";
    private static final int JOB_ID = 42;
    private static final int ALARM_REQ = 77;
    private static final long ALARM_MS = 45_000;
    private static int nextId = 1000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private NotifyHelper() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveToken(Context ctx, String token) {
        Context app = ctx.getApplicationContext();
        prefs(app).edit().putString(KEY_TOKEN, token == null ? "" : token).apply();
        if (token != null && !token.isEmpty()) {
            ensureChannel(app);
            ensureKeepAliveChannel(app);
            schedule(app);
            scheduleAlarm(app);
            MAIN.post(() -> {
                NotifyPollService.start(app);
                maybePostTest(app);
            });
        } else {
            MAIN.post(() -> NotifyPollService.stop(app));
        }
    }

    static String token(Context ctx) {
        return prefs(ctx).getString(KEY_TOKEN, "");
    }

    /** One-shot shade notification so the user can confirm the channel works. */
    static void maybePostTest(Context ctx) {
        if (prefs(ctx).getBoolean(KEY_TESTED, false)) return;
        if (!canPost(ctx)) return;
        prefs(ctx).edit().putBoolean(KEY_TESTED, true).apply();
        post(ctx, "test-" + System.currentTimeMillis(), "TeamTask alerts on",
            "You will get task comments and reminders here, even when the app is closed.");
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        // Drop old broken channel if present
        try {
            nm.deleteNotificationChannel("teamtask");
        } catch (Exception ignored) {
        }
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID,
            "TeamTask alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Task comments, checklist, and reminders");
        ch.enableVibration(true);
        ch.enableLights(true);
        ch.setShowBadge(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(false);
        nm.createNotificationChannel(ch);
    }

    static void ensureKeepAliveChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.deleteNotificationChannel("teamtask_keepalive");
        } catch (Exception ignored) {
        }
        NotificationChannel ch = new NotificationChannel(
            KEEP_ALIVE_CHANNEL,
            "Background sync",
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Keeps TeamTask able to deliver alerts when the app is closed");
        ch.setShowBadge(false);
        ch.enableVibration(false);
        ch.setSound(null, null);
        nm.createNotificationChannel(ch);
    }

    static boolean canPost(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) {
            Log.w(TAG, "notifications disabled for app");
            return false;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                Log.w(TAG, "alert channel disabled");
                return false;
            }
        }
        return true;
    }

    static void post(Context ctx, String id, String title, String body) {
        Context app = ctx.getApplicationContext();
        if (id != null && !id.isEmpty() && alreadySeen(app, id)) return;
        if (!canPost(app)) {
            Log.w(TAG, "skip post (cannot post): " + title);
            return;
        }
        ensureChannel(app);
        final String t = title == null || title.isEmpty() ? "TeamTask" : title;
        final String b = body == null ? "" : body;
        final String nid = id;
        Runnable r = () -> {
            try {
                NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                Intent open = new Intent(app, MainActivity.class);
                open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getActivity(app, 0, open, flags);
                Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(app, CHANNEL_ID)
                    : new Notification.Builder(app);
                builder.setContentTitle(t)
                    .setContentText(b)
                    .setStyle(new Notification.BigTextStyle().bigText(b))
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setAutoCancel(true)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setCategory(Notification.CATEGORY_MESSAGE)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setContentIntent(pi)
                    .setTicker(t);
                if (Build.VERSION.SDK_INT >= 21) {
                    builder.setPriority(Notification.PRIORITY_HIGH);
                }
                int notifyId = nid != null && !nid.isEmpty() ? Math.abs(nid.hashCode()) : nextId++;
                nm.notify(notifyId, builder.build());
                if (nid != null && !nid.isEmpty()) markSeen(app, nid);
                Log.i(TAG, "posted: " + t);
            } catch (Exception e) {
                Log.e(TAG, "post failed: " + e.getMessage());
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) r.run();
        else MAIN.post(r);
    }

    static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        ComponentName name = new ComponentName(ctx, NotifyJobService.class);
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID, name)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true);
        if (Build.VERSION.SDK_INT >= 24) {
            b.setPeriodic(15 * 60_000L, 5 * 60_000L);
        } else {
            b.setPeriodic(15 * 60_000L);
        }
        try {
            js.schedule(b.build());
        } catch (Exception ignored) {
            JobInfo once = new JobInfo.Builder(JOB_ID, name)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(30_000)
                .setOverrideDeadline(90_000)
                .setPersisted(true)
                .build();
            js.schedule(once);
        }
    }

    static void scheduleAlarm(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, AlarmReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, ALARM_REQ, i, flags);
        long when = SystemClock.elapsedRealtime() + ALARM_MS;
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pi);
            }
        } catch (Exception e) {
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pi);
        }
    }

    static int pullAndPost(Context ctx) {
        String tok = token(ctx);
        if (tok == null || tok.isEmpty()) {
            Log.w(TAG, "pull skipped: no token");
            return 0;
        }
        String raw;
        try {
            raw = httpGet(SITE + "api/notifications", tok);
        } catch (Exception e) {
            Log.e(TAG, "pull failed: " + e.getMessage());
            return 0;
        }
        if (raw == null || raw.isEmpty()) {
            Log.w(TAG, "pull empty response");
            return 0;
        }
        List<JSONObject> items = parseItems(raw);
        Log.i(TAG, "pull got " + items.size() + " notifications");
        if (items.isEmpty()) return 0;
        int posted = 0;
        // Oldest first so shade order matches chronology
        for (int i = items.size() - 1; i >= 0; i--) {
            JSONObject n = items.get(i);
            String id = n.optString("id");
            if (id.isEmpty() || alreadySeen(ctx, id)) continue;
            // Skip already-read history; still mark so we never flood on install
            if (n.optBoolean("read", false)) {
                markSeen(ctx, id);
                continue;
            }
            post(ctx, id, n.optString("title"), n.optString("body"));
            posted++;
        }
        return posted;
    }

    private static List<JSONObject> parseItems(String raw) {
        List<JSONObject> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        try {
            JSONObject root = new JSONObject(raw);
            JSONArray arr = root.optJSONArray("notifications");
            if (arr == null) return out;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject n = arr.optJSONObject(i);
                if (n != null) out.add(n);
            }
        } catch (Exception e) {
            Log.e(TAG, "parse failed: " + e.getMessage());
        }
        return out;
    }

    private static boolean alreadySeen(Context ctx, String id) {
        return seenSet(ctx).contains(id);
    }

    private static void markSeen(Context ctx, String id) {
        if (id == null || id.isEmpty()) return;
        Set<String> set = seenSet(ctx);
        set.add(id);
        while (set.size() > 300) {
            String first = set.iterator().next();
            set.remove(first);
        }
        StringBuilder sb = new StringBuilder();
        for (String x : set) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(x);
        }
        prefs(ctx).edit().putString(KEY_SEEN, sb.toString()).apply();
    }

    private static Set<String> seenSet(Context ctx) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        String raw = prefs(ctx).getString(KEY_SEEN, "");
        if (raw == null || raw.isEmpty()) return set;
        for (String line : raw.split("\n")) {
            if (!line.isEmpty()) set.add(line);
        }
        return set;
    }

    private static String httpGet(String url, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(12000);
            c.setReadTimeout(12000);
            c.setRequestMethod("GET");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 400 ? c.getErrorStream() : c.getInputStream()
            ));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            if (code == 401 || code == 403) {
                Log.w(TAG, "auth failed HTTP " + code);
                return "";
            }
            if (code >= 400) {
                Log.w(TAG, "HTTP " + code);
                return "";
            }
            return sb.toString();
        } finally {
            c.disconnect();
        }
    }
}
