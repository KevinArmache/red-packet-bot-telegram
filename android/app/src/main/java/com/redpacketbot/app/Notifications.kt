package com.redpacketbot.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** Notifications de l'app : celle, permanente, du bot, et les demandes d'action. */
object Notifications {
    const val CHANNEL_BOT = "bot"
    const val CHANNEL_ACTION = "action"
    const val CHANNEL_SQUARE = "square"

    const val ID_BOT = 1
    const val ID_TELEGRAM = 2
    const val ID_BINANCE = 3
    const val ID_RESTART = 4
    const val ID_SQUARE = 5

    fun ensureChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_BOT, "Bot en marche", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Notification permanente du bot. Ne la désactive pas : son chronomètre " +
                    "empêche HiOS (Tecno) de geler le bot en arrière-plan."
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ACTION, "Action requise", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Code Telegram demandé, reconnexion Binance ou Telegram à faire."
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_SQUARE, "Red Packets Binance Square", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Red Packets à prendre sur Binance Square : une seule notification, mise à jour."
            },
        )
    }

    /** Ouvre l'app (sur un écran donné : « telegram », « health »…). */
    fun openApp(context: Context, screen: String? = null, requestCode: Int = 0): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (screen != null) intent.putExtra(MainActivity.EXTRA_SCREEN, screen)
        return PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun openBinanceLogin(context: Context): PendingIntent = PendingIntent.getActivity(
        context, 10,
        Intent(context, BinanceLoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun action(context: Context, id: Int, title: String, text: String, intent: PendingIntent) {
        val notification = Notification.Builder(context, CHANNEL_ACTION)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(intent)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(id, notification)
    }

    /** 🧧 Une seule notification, mise à jour sur place : elle ne sonne qu'une fois. */
    fun square(context: Context, count: Int, latest: String) {
        val title = if (count == 1) "🧧 1 Red Packet à prendre" else "🧧 $count Red Packets à prendre"
        val notification = Notification.Builder(context, CHANNEL_SQUARE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(latest)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp(context, MainActivity.SCREEN_SQUARE, 5))
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(ID_SQUARE, notification)
    }

    fun cancel(context: Context, id: Int) {
        context.getSystemService(NotificationManager::class.java).cancel(id)
    }
}
