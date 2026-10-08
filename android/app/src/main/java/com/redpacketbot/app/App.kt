package com.redpacketbot.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.ensureChannels(this)
        // WorkManager ne vit que dans le processus principal (pas dans « :bot »)
        if (Application.getProcessName() == packageName) Watchdog.schedule(this)
    }
}
