package com.redpacketbot.app

import android.app.ActivityManager
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

/** Le service du bot tourne-t-il déjà ? (Android ne liste plus que nos propres services) */
@Suppress("DEPRECATION")
fun isBotServiceRunning(context: Context): Boolean = try {
    context.getSystemService(ActivityManager::class.java)
        .getRunningServices(Int.MAX_VALUE)
        .any { it.service.className == BotService::class.java.name }
} catch (_: Exception) {
    false
}

/**
 * Relance le bot s'il devrait tourner : ouverture de l'app, gardien. Sans effet
 * si son service tourne déjà, sans session Telegram (la connexion se fait dans
 * l'app), ou si une relance est déjà programmée (attente après un arrêt).
 */
fun ensureBotRunning(context: Context, reason: String) {
    if (!shouldRun(context) || isBotServiceRunning(context)) return
    val files = AppFiles(context)
    if (!files.telegramSession.exists()) return
    if (BotState.read(files).optLong("restartAt", 0L) > System.currentTimeMillis()) return
    startBotSafely(context, reason)
}

/**
 * Démarrage du téléphone, et mise à jour de l'app : le bot repart tout seul.
 * Une relance programmée n'y change rien : son alarme a disparu avec le
 * redémarrage ou la mise à jour.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Watchdog.schedule(context)
        if (shouldRun(context) && AppFiles(context).telegramSession.exists()) {
            startBotSafely(context, "démarrage du téléphone")
        }
    }
}

/** Alarme de relance programmée par le service (après un arrêt du bot). */
class RestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (shouldRun(context)) startBotSafely(context, "relance programmée")
    }
}
