package com.teamtask.web;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps polling the API while the app is not open so alerts can reach the
 * notification shade. Xiaomi/MIUI often kill JobScheduler; a foreground
 * service is the reliable path without FCM.
 */
public class NotifyPollService extends Service {
    public static final String ACTION_START = "com.teamtask.web.START_POLL";
    public static final String ACTION_STOP = "com.teamtask.web.STOP_POLL";
    private static final int ONGOING_ID = 9001;
    private static final long INTERVAL_MS = 20_000;

    private HandlerThread worker;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private boolean started;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            try {
                PowerManager.WakeLock wl = wakeLock;
                if (wl != null && !wl.isHeld()) wl.acquire(30_000);
                NotifyHelper.pullAndPost(getApplicationContext());
            } catch (Exception ignored) {
            } finally {
                try {
                    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                } catch (Exception ignored) {
                }
                if (handler != null) handler.postDelayed(this, INTERVAL_MS);
            }
        }
    };

    public static void start(Context ctx) {
        String tok = NotifyHelper.token(ctx);
        if (tok == null || tok.isEmpty()) return;
        Intent i = new Intent(ctx, NotifyPollService.class);
        i.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        Intent i = new Intent(ctx, NotifyPollService.class);
        i.setAction(ACTION_STOP);
        ctx.startService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotifyHelper.ensureChannel(this);
        NotifyHelper.ensureKeepAliveChannel(this);
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "teamtask:poll");
            wakeLock.setReferenceCounted(false);
        }
        worker = new HandlerThread("teamtask-poll");
        worker.start();
        handler = new Handler(worker.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String tok = NotifyHelper.token(this);
        if (tok == null || tok.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startAsForeground();
        if (!started) {
            started = true;
            handler.removeCallbacks(tick);
            handler.post(tick);
        }
        NotifyHelper.scheduleAlarm(this);
        return START_STICKY;
    }

    private void startAsForeground() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, flags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, NotifyHelper.KEEP_ALIVE_CHANNEL)
            : new Notification.Builder(this);
        b.setContentTitle("TeamTask")
            .setContentText("Checking for task alerts…")
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_MIN);
        }
        startForeground(ONGOING_ID, b.build());
    }

    @Override
    public void onDestroy() {
        started = false;
        if (handler != null) handler.removeCallbacks(tick);
        if (worker != null) {
            worker.quitSafely();
            worker = null;
        }
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        NotifyHelper.scheduleAlarm(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
