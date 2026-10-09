package com.redpacketbot.app

import android.Manifest
import android.app.ActivityManager
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.system.Os
import android.system.OsConstants

/**
 * Écran « Santé » : ce qu'Android et HiOS (Tecno) doivent laisser faire au
 * bot pour qu'il tourne 24 h/24. Chaque point a un bouton qui ouvre le bon
 * écran des réglages.
 */
object Health {

    /** ok = true / false (vérifié automatiquement), null = à vérifier à la main. */
    data class Item(
        val key: String,
        val title: String,
        val ok: Boolean?,
        val detail: String,
        val actionLabel: String? = null,
        val intent: (Context) -> Intent? = { null },
    )

    fun check(context: Context): List<Item> {
        val pkg = context.packageName
        val power = context.getSystemService(PowerManager::class.java)
        val activity = context.getSystemService(ActivityManager::class.java)
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val items = mutableListOf<Item>()

        val notifications = context.getSystemService(NotificationManager::class.java)
        val appNotificationsOk = notifications.areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
        val botChannelOk = notifications.getNotificationChannel(Notifications.CHANNEL_BOT)
            ?.let { it.importance != NotificationManager.IMPORTANCE_NONE } ?: true
        items += Item(
            "notifications", "Notifications autorisées", appNotificationsOk && botChannelOk,
            "Indispensable sur Tecno : la notification « Bot en marche » (avec son chronomètre) empêche HiOS " +
                "de geler le bot. Ne la désactive pas, et laisse aussi passer les demandes de reconnexion.",
            "Autoriser",
        ) {
            if (appNotificationsOk) {
                Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                    .putExtra(Settings.EXTRA_CHANNEL_ID, Notifications.CHANNEL_BOT)
            } else {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            }
        }

        items += Item(
            "battery", "Batterie : sans restriction", power.isIgnoringBatteryOptimizations(pkg),
            "Le réglage le plus important : sans lui, Android coupe le bot écran éteint.",
            "Autoriser",
        ) {
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg"))
        }

        items += Item(
            "background", "Activité en arrière-plan autorisée", !activity.isBackgroundRestricted,
            "Réglages → Applis → Red Packet Bot → Batterie : « Autoriser l'activité en arrière-plan » " +
                "activé, et « Arrêter l'appli inactive » désactivé.",
            "Ouvrir",
        ) { appDetails(pkg) }

        val dataRestricted = connectivity.restrictBackgroundStatus ==
            ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        items += Item(
            "data", "Données en arrière-plan", !dataRestricted,
            "L'économiseur de données ne doit pas couper Internet au bot.",
            "Ouvrir",
        ) {
            Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS, Uri.parse("package:$pkg"))
        }

        val alarms = context.getSystemService(AlarmManager::class.java)
        val exactOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
        items += Item(
            "alarms", "Relance à l'heure exacte", exactOk,
            "Permet de relancer le bot à l'heure prévue après un arrêt, même téléphone en veille.",
            "Ouvrir",
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg"))
            } else {
                null
            }
        }

        val autoTime = Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME, 0) == 1
        items += Item(
            "time", "Heure automatique", autoTime,
            "Le bot compare l'heure du téléphone à celle de Telegram : une horloge fausse fait tout ignorer.",
            "Ouvrir",
        ) { Intent(Settings.ACTION_DATE_SETTINGS) }

        val pageSize = Os.sysconf(OsConstants._SC_PAGESIZE)
        items += Item(
            "pagesize", "Compatibilité Node.js", pageSize == 4096L,
            if (pageSize == 4096L) "Mémoire en pages de 4 Ko : Node.js mobile fonctionne."
            else "Pages mémoire de ${pageSize / 1024} Ko : Node.js mobile risque de ne pas démarrer.",
        )

        // HiOS « AI Net » : coupe le Wi-Fi et les données pendant le sommeil
        // (constaté : Telegram coupé 30 à 50 min, plusieurs fois par nuit)
        val aiNet = try {
            Settings.Global.getString(context.contentResolver, "ai_net_control_enable")
        } catch (_: Exception) {
            null
        }
        if (aiNet != null) {
            items += Item(
                "ainet", "Tecno : réseau gardé la nuit", aiNet != "1",
                "Le réglage HiOS « AI Net » coupe le Wi-Fi et les données pendant ton sommeil : le bot devient " +
                    "sourd 30 à 50 min, plusieurs fois par nuit. Pour le couper, par câble : " +
                    "adb shell settings put global ai_net_control_enable 0, puis redémarre le téléphone.",
            )
        }

        items += Item(
            "autostart", "Tecno : démarrage automatique", null,
            "Phone Master → Accélérer → Gestion du démarrage auto → active Red Packet Bot. " +
                "Puis Phone Master → menu → Réglages → Applis protégées → ajoute Red Packet Bot.",
            "Ouvrir Phone Master",
        ) { phoneMasterAutoStart(it) }

        items += Item(
            "cleanup", "Tecno : pas de nettoyage écran verrouillé", null,
            "Phone Master → réglages : désactive « Nettoyage à l'écran verrouillé » (ou mets l'app en liste " +
                "blanche). Réglages → Batterie : désactive l'économie d'énergie et Power Marathon.",
            "Ouvrir Phone Master",
        ) { phoneMaster(it) }

        items += Item(
            "recents", "Verrouiller l'app dans les récentes", null,
            "Ouvre les applis récentes, appuie sur le petit triangle à côté de Red Packet Bot (ou maintiens la " +
                "carte), puis choisis « Verrouiller ». Laisse le téléphone en charge.",
        )

        items += Item(
            "freezer", "Tecno : pas de « congélation »", null,
            "Écran d'accueil : appui long → Paramètres du bureau → Autres réglages → Congélateur (Freezer) : " +
                "vérifie que Red Packet Bot n'y est pas.",
        )
        return items
    }

    private fun appDetails(pkg: String) =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))

    private fun phoneMasterAutoStart(context: Context): Intent {
        val autoStart = Intent().setComponent(
            ComponentName("com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity"),
        )
        return if (autoStart.resolveActivity(context.packageManager) != null) autoStart else phoneMaster(context)
    }

    private fun phoneMaster(context: Context): Intent =
        context.packageManager.getLaunchIntentForPackage("com.transsion.phonemaster")
            ?: appDetails(context.packageName)
}
