package com.redpacketbot.app

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Filet de sécurité, toutes les 15 min : si le bot devrait tourner mais ne
 * donne plus signe de vie (processus tué par Android, relance manquée), on le
 * relance. Ne touche à rien si tu l'as arrêté ou si une relance est prévue.
 */
class Watchdog(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val files = AppFiles(applicationContext)
        if (!shouldRun(applicationContext)) return Result.success()

        val state = BotState.read(files)
        val now = System.currentTimeMillis()
        val restartAt = state.optLong("restartAt", 0L)
        if (restartAt > now) return Result.success() // relance déjà programmée

        val heartbeat = Heartbeat.read(files.heartbeat)
        val silentMs = heartbeat?.ageMs ?: Long.MAX_VALUE
        val startedRecently = now - state.optLong("statusSince", 0L) < 5 * 60_000L
        val waitingForUser = state.optString("status") == BotState.TELEGRAM_REQUIRED ||
            state.has("prompt")
        if (silentMs > 10 * 60_000L && !startedRecently && !waitingForUser) {
            startBotSafely(applicationContext, "watchdog")
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "watchdog",
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<Watchdog>(15, TimeUnit.MINUTES).build(),
            )
        }
    }
}
