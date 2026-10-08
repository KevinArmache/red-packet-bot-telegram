package com.redpacketbot.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Doit-on faire tourner le bot ? (réglages complets, pas arrêté par toi) */
fun shouldRun(context: Context): Boolean {
    val files = AppFiles(context)
    return !files.userStopped.exists() && BotConfig.load(files.config).isComplete
}

/** Démarre le bot ; si Android refuse (arrière-plan), une notification propose de le faire. */
fun startBotSafely(context: Context, reason: String) {
    try {
        BotService.send(context, BotService.ACTION_START)
    } catch (e: Exception) {
        Log.w("RedPacketBot", "Démarrage refusé ($reason) : ${e.message}")
        Notifications.ensureChannels(context)
        Notifications.action(
            context, Notifications.ID_RESTART, "▶️ Relancer le bot",
            "Android n'a pas laissé le bot redémarrer tout seul ($reason). Touche ici, puis « Démarrer ». " +
                "Vérifie l'écran « Santé » (batterie sans restriction).",
            Notifications.openApp(context, MainActivity.SCREEN_HOME, 4),
        )
    }
}

/** Démarrage du téléphone, et mise à jour de l'app : le bot repart tout seul. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Watchdog.schedule(context)
        if (shouldRun(context)) startBotSafely(context, "démarrage du téléphone")
    }
}

/** Alarme de relance programmée par le service (après un arrêt du bot). */
class RestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (shouldRun(context)) startBotSafely(context, "relance programmée")
    }
}
