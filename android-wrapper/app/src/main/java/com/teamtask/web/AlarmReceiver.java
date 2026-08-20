package com.teamtask.web;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Wakes the poller when an exact alarm fires (backup if the service was killed). */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        NotifyHelper.pullAndPost(context);
        NotifyPollService.start(context);
        NotifyHelper.scheduleAlarm(context);
    }
}
