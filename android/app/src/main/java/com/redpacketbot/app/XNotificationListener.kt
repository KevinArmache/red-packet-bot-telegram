package com.redpacketbot.app

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.text.Spanned
import android.text.style.URLSpan
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * 🐦 Codes publiés sur X : lit les notifications de l'appli X officielle (comptes
 * suivis avec la cloche « Tous les posts ») et en transmet le texte au bot
 * (message « x.post » du pont, voir src/xsource.js). Ni scraping ni API.
 *
 * Toute autre notification est ignorée sans être lue ni enregistrée. Tourne
 * dans le processus « :bot » (comme BinanceLoginActivity) pour joindre
 * directement le service du bot ; Android la lie lui-même une fois l'accès
 * aux notifications accordé.
 */
class XNotificationListener : NotificationListenerService() {

    companion object {
        const val X_PACKAGE = "com.twitter.android"
        /** Notifications de test envoyées par adb : lues seulement en essai à blanc. */
        private const val TEST_PACKAGE = "com.android.shell"
        private const val TAG = "RedPacketBot"
        private const val DEDUP_MS = 15 * 60_000L
        private const val DEDUP_MAX = 300
        /** Vérification « le bot tourne-t-il ? » au plus toutes les 5 min (voir checkBot). */
        private const val BOT_CHECK_MS = 5 * 60_000L

        fun component(context: Context) = ComponentName(context, XNotificationListener::class.java)

        fun isAccessGranted(context: Context): Boolean =
            NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

        /** Écran Android qui accorde l'accès aux notifications (directement à notre app si possible). */
        fun settingsIntent(context: Context): Intent =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                    .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component(context).flattenToString())
            } else {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            }

        fun isXInstalled(context: Context): Boolean = try {
            context.packageManager.getPackageInfo(X_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private lateinit var files: AppFiles
    private var configStamp = -1L
    private var enabled = false
    private var dryRun = false

    /** Notification déjà transmise (clé + empreinte du texte) → heure. */
    private val seen = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>) = size > DEDUP_MAX
    }
    private var connected = false
    private var connectedAt = 0L
    private var posts = 0
    private var dropped = 0
    private var lastPostAt = 0L
    private var lastFrom = ""
    private var lastExcerpt = ""
    private var lastBotCheck = 0L

    override fun onCreate() {
        super.onCreate()
        files = AppFiles(this)
    }

    override fun onListenerConnected() {
        connected = true
        connectedAt = System.currentTimeMillis()
        writeStatus()
        checkBot()
    }

    /**
     * Android relance lui-même cet écouteur (donc le processus « :bot ») après une
     * mise à jour de l'app ou un arrêt forcé par le système. Or HiOS bloque souvent
     * l'annonce de mise à jour et retient le gardien (WorkManager) d'une app gelée :
     * c'est alors l'écouteur qui relance le bot, sinon HiOS gèlerait l'app 5 s plus
     * tard, bot arrêté, jusqu'à ce que tu l'ouvres. Sans effet si le bot tourne,
     * si tu l'as arrêté ou si une relance est déjà programmée (ensureBotRunning).
     */
    private fun checkBot() {
        val now = System.currentTimeMillis()
        if (BotService.instance != null || now - lastBotCheck < BOT_CHECK_MS) return
        lastBotCheck = now
        ensureBotRunning(this, "écouteur de notifications")
    }

    override fun onListenerDisconnected() {
        connected = false
        writeStatus()
        // Android a coupé le lien (mise à jour, mémoire) : on le redemande
        try {
            requestRebind(component(this))
        } catch (e: Exception) {
            Log.w(TAG, "X : nouvelle liaison impossible : ${e.message}")
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        checkBot()
        val pkg = sbn.packageName
        if (pkg != X_PACKAGE && pkg != TEST_PACKAGE) return
        reloadConfig()
        if (!enabled || (pkg == TEST_PACKAGE && !dryRun)) return

        val notification = sbn.notification ?: return
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        if (notification.category == Notification.CATEGORY_PROGRESS ||
            notification.category == Notification.CATEGORY_SERVICE
        ) {
            return
        }

        val extras = notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)
        val titleBig = extras.getCharSequence(Notification.EXTRA_TITLE_BIG)
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.toList().orEmpty()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)
        // Posts avec image (BigPictureStyle) : X y range aussi le texte du post
        val summaryText = extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)
        val ticker = notification.tickerText
        val messages = try {
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)?.messages.orEmpty()
        } catch (_: Exception) {
            emptyList()
        }

        val body = buildList {
            bigText?.let(::add)
            text?.let(::add)
            summaryText?.let(::add)
            ticker?.let(::add)
            addAll(lines)
            messages.forEach { m -> m.text?.let(::add) }
        }
        if (body.all { it.isBlank() }) return

        // La même notification revient souvent (mise à jour, regroupement) :
        // transmise une fois par texte
        val now = System.currentTimeMillis()
        val dedupKey = "${sbn.key}|${body.joinToString("\n").hashCode()}"
        seen.entries.removeAll { now - it.value > DEDUP_MS }
        if (seen.containsKey(dedupKey)) return
        val update = seen.keys.any { it.startsWith("${sbn.key}|") }
        seen[dedupKey] = now

        // Liens cachés derrière le texte (t.co) : la vraie adresse peut contenir le code
        val urls = (body + listOfNotNull(title)).flatMap { urlsOf(it) }.distinct()

        val data = JSONObject()
            .put("v", 1)
            .put("pkg", pkg)
            .put("key", sbn.key)
            .put("channel", notification.channelId ?: "")
            .put("category", notification.category ?: "")
            .put("title", title?.toString() ?: "")
            .put("titleBig", titleBig?.toString() ?: "")
            .put("text", text?.toString() ?: "")
            .put("bigText", bigText?.toString() ?: "")
            .put("lines", JSONArray(lines.map { it.toString() }))
            .put("subText", subText?.toString() ?: "")
            .put("summaryText", summaryText?.toString() ?: "")
            .put("ticker", ticker?.toString() ?: "")
            .put(
                "messages",
                JSONArray(messages.map { m ->
                    JSONObject().put("sender", m.person?.name?.toString() ?: "").put("text", m.text?.toString() ?: "")
                }),
            )
            .put("urls", JSONArray(urls))
            .put("postedAt", sbn.postTime)
            .put("when", notification.`when`)
            .put("update", update)

        posts++
        lastPostAt = now
        lastFrom = (titleBig ?: title)?.toString()?.take(60) ?: ""
        lastExcerpt = (bigText ?: text)?.toString()?.replace(Regex("\\s+"), " ")?.take(120) ?: ""
        val delivered = BotService.instance?.onXNotification(data) ?: false
        if (!delivered) dropped++
        writeStatus()
    }

    private fun urlsOf(value: CharSequence): List<String> =
        (value as? Spanned)?.getSpans(0, value.length, URLSpan::class.java)?.mapNotNull { it.url }.orEmpty()

    /** Réglages relus seulement quand config.json change. */
    private fun reloadConfig() {
        val stamp = files.config.lastModified()
        if (stamp == configStamp) return
        configStamp = stamp
        val config = BotConfig.load(files.config)
        enabled = config.xEnabled
        dryRun = config.xDryRun
    }

    /** État lu par l'app (écran Sources) et par « dumpsys ». */
    private fun writeStatus() {
        try {
            files.xListener.writeTextAtomic(
                JSONObject()
                    .put("connected", connected)
                    .put("connectedAt", connectedAt)
                    .put("posts", posts)
                    .put("dropped", dropped)
                    .put("lastPostAt", lastPostAt)
                    .put("lastFrom", lastFrom)
                    .put("lastExcerpt", lastExcerpt)
                    .put("at", System.currentTimeMillis())
                    .toString(),
            )
        } catch (_: Exception) {
            /* non bloquant */
        }
    }
}
