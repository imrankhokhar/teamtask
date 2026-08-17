package com.teamtask.web;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class NotifyJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                NotifyHelper.pullAndPost(getApplicationContext());
            } finally {
                NotifyHelper.schedule(getApplicationContext());
                jobFinished(params, false);
            }
        }, "teamtask-notify").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
