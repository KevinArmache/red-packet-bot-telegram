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
 * donne plus signe de vie depuis 2 min et que son service ne tourne plus
 * (processus tué par Android, relance manquée, mise à jour dont HiOS a bloqué
 * l'annonce), on le relance. Ne touche à rien si tu l'as arrêté ou si une
 * relance est prévue (voir ensureBotRunning).
 */
class Watchdog(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val heartbeat = Heartbeat.read(AppFiles(applicationContext).heartbeat)
        // Signe de vie écrit toutes les 15 s : au-delà de 2 min, le bot ne tourne plus
        if ((heartbeat?.ageMs ?: Long.MAX_VALUE) > 2 * 60_000L) {
            ensureBotRunning(applicationContext, "watchdog")
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
