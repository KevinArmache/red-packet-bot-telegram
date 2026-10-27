package com.redpacketbot.app

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.io.FileDescriptor
import java.io.PrintWriter
import java.io.RandomAccessFile
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Le bot, en service de premier plan (notification permanente), dans le
 * processus « :bot » :
 *  - démarre Node.js avec le code du bot (le même que sur le PC) ;
 *  - héberge la WebView Binance qui réclame les codes (jamais affichée,
 *    donc jamais gelée par Android) ;
 *  - joue le rôle de superviseur : relance après un arrêt (attente qui
 *    double de 10 s à 10 min), connexion Telegram à refaire (code 78),
 *    bot figé (aucun signe de vie depuis 5 min).
 *
 * Node ne démarre qu'une fois par processus : pour le relancer, le service
 * programme une alarme puis arrête son processus ; l'alarme le recrée.
 */
class BotService : Service() {

    companion object {
        const val ACTION_START = "com.redpacketbot.app.START"
        const val ACTION_STOP = "com.redpacketbot.app.STOP"
        const val ACTION_RESTART = "com.redpacketbot.app.RESTART"
        const val ACTION_TELEGRAM_LOGIN = "com.redpacketbot.app.TELEGRAM_LOGIN"
        const val ACTION_PROMPT_ANSWER = "com.redpacketbot.app.PROMPT_ANSWER"
        const val ACTION_TEST_ALERT = "com.redpacketbot.app.TEST_ALERT"
        const val ACTION_SETUP_CHANNEL = "com.redpacketbot.app.SETUP_CHANNEL"
        const val ACTION_CHECK_CHANNEL = "com.redpacketbot.app.CHECK_CHANNEL"
        const val EXTRA_TITLE = "title"
        const val EXTRA_USERNAME = "username"
        const val EXTRA_PROMPT_ID = "promptId"
        const val EXTRA_VALUE = "value"

        private const val TAG = "RedPacketBot"
        private const val EXIT_LOGIN_REQUIRED = 78
        private const val MIN_BACKOFF_MS = 10_000L
        private const val MAX_BACKOFF_MS = 600_000L
        private const val STABLE_RUN_MS = 5 * 60_000L
        private const val TELEGRAM_RETRY_MS = 30 * 60_000L
        private const val FROZEN_AFTER_MS = 5 * 60_000L
        private const val TELEGRAM_DEAF_MS = 30 * 60_000L
        // HiOS ne compte une notification « en cours » que 5 min (voir updateNotification)
        private const val PROGRESS_RENEW_MS = 4 * 60_000L
        // Compte à rebours de relance republié après le retrait de la notification du bot
        private const val RESTART_NOTICE_REPOST_MS = 500L
        // Pompe d'images de la WebView de réclamation (voir pumpTick)
        private const val PUMP_INTERVAL_MS = 33L
        private const val PUMP_DEFAULT_MS = 30_000L
        private const val PUMP_MAX_MS = 120_000L
        private const val PUMP_WIDTH_PX = 64
        private const val PUMP_HEIGHT_PX = 40

        /** Service du processus courant (pour l'écran de connexion Binance, même processus). */
        @Volatile
        var instance: BotService? = null
            private set

        /** Envoie une commande au service (le démarre si besoin). */
        fun send(context: Context, action: String, extras: Intent.() -> Unit = {}) {
            val intent = Intent(context, BotService::class.java).setAction(action).apply(extras)
            ContextCompat.startForegroundService(context, intent)
        }
    }

    private lateinit var files: AppFiles
    private val main = Handler(Looper.getMainLooper())
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var wakeLock: PowerManager.WakeLock? = null
    private var bridge: NodeBridge? = null
    private var devtools: DevToolsProxy? = null
    private var claimWebView: WebView? = null
    @Volatile private var lastStartId = 0
    // Watchdog : temps d'activité (uptimeMillis ne compte pas la veille profonde,
    // donc un téléphone endormi n'est pas pris pour un bot figé)
    @Volatile private var lastHeartbeatTs = 0L
    @Volatile private var lastHeartbeatChangeUptime = 0L
    @Volatile private var nodeStartedUptime = 0L
    @Volatile private var lastTelegramOkUptime = 0L

    @Volatile private var nodeRunning = false
    /** Démarrage en cours (extraction du code, puis Node) : pas de second lancement. */
    @Volatile private var launching = false
    /** Redémarrage demandé pendant le démarrage : fait dès que Node tourne. */
    @Volatile private var restartAfterLaunch = false
    @Volatile private var nodeStartedAt = 0L
    @Volatile private var exitHandled = false
    @Volatile private var stopRequested = false
    @Volatile private var restartRequested = false
    @Volatile private var pendingPromptId = 0
    private var lastBrowserState = ""
    /** Début du processus :bot, affiché par le chronomètre de la notification. */
    private val runningSince = System.currentTimeMillis()
    /** Dernière remise à zéro du compteur « en cours » de HiOS (voir updateNotification). */
    @Volatile private var progressRenewedAt = 0L
    private val notificationLock = Any()
    /** 🪟 Fenêtre anti-gel (voir showFreezeGuard), fil principal seulement. */
    private var freezeGuard: View? = null

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * État du bot, lisible par câble même téléphone verrouillé (l'APK normale n'est
     * pas débogable) : adb shell dumpsys activity service com.redpacketbot.app/.BotService
     * Ajoute « logs » à la commande pour les 40 dernières lignes des logs du bot.
     * Rien de secret : ni réglages, ni sessions.
     */
    override fun dump(fd: FileDescriptor?, writer: PrintWriter?, args: Array<out String>?) {
        val out = writer ?: return
        val state = BotState.read(files)
        val heartbeat = Heartbeat.read(files.heartbeat)
        out.println("Red Packet Bot ${AppVersion.label}")
        out.println(
            "status=${state.optString("status")} nodeRunning=$nodeRunning launching=$launching " +
                "restartAt=${state.optLong("restartAt", 0L)}",
        )
        if (heartbeat == null) {
            out.println("heartbeat: aucun")
        } else {
            out.println(
                "heartbeat: il y a ${Status.ago(heartbeat.ageMs)} mode=${heartbeat.mode} " +
                    "browser=${heartbeat.browser} telegramOk=${heartbeat.telegramOk}",
            )
            out.println(
                "sleeps=${heartbeat.sleeps} disconnects=${heartbeat.disconnects} messages=${heartbeat.messages} " +
                    "detected=${heartbeat.detected} won=${heartbeat.won}",
            )
        }
        Status.lastError(state)?.let { out.println("lastError: $it") }
        val config = BotConfig.load(files.config)
        val x = XListenerState.read(files.xListener)
        out.println(
            "hios: progression renouvelée " +
                (if (progressRenewedAt > 0) "il y a ${Status.ago(System.currentTimeMillis() - progressRenewedAt)}" else "jamais") +
                " (toutes les ${PROGRESS_RENEW_MS / 60_000} min ; HiOS gèle au-delà de 5 min) " +
                "fenêtre=${if (freezeGuard != null) "affichée" else "absente"} " +
                "autorisation=${Settings.canDrawOverlays(this)}",
        )
        out.println(
            "x: enabled=${config.xEnabled} dryRun=${config.xDryRun} access=${XNotificationListener.isAccessGranted(this)} " +
                "listener=${x.connected} posts=${x.posts} dropped=${x.dropped} " +
                "lastPost=${if (x.lastPostAt > 0) "il y a ${Status.ago(System.currentTimeMillis() - x.lastPostAt)}" else "aucun"} " +
                "botCodes=${heartbeat?.xCodes ?: 0}",
        )
        // « pump 30000 » : pompe d'images de la WebView pendant 30 s (mesures par
        // câble). dump() tourne sur le fil principal, comme la pompe.
        val pumpArg = args?.indexOf("pump") ?: -1
        if (pumpArg >= 0) {
            pumpFrames((args?.getOrNull(pumpArg + 1)?.toLongOrNull() ?: PUMP_DEFAULT_MS).coerceIn(0L, PUMP_MAX_MS))
        }
        val pumpLeft = pumpUntil - SystemClock.uptimeMillis()
        out.println(
            "pump: " + when {
                claimWebView == null -> "aucune WebView de réclamation"
                pumpLeft > 0 -> "active encore ${pumpLeft / 1000} s"
                else -> "au repos"
            },
        )
        // « logs » : 40 dernières lignes ; « logs 2000 » : les 2000 dernières (enquêtes)
        val logsArg = args?.indexOf("logs") ?: -1
        if (logsArg >= 0) {
            val count = (args?.getOrNull(logsArg + 1)?.toIntOrNull() ?: 40).coerceIn(1, 5000)
            out.println("--- logs/bot.log (fin)")
            lastLogLines(count).forEach(out::println)
        }
    }

    private fun lastLogLines(count: Int): List<String> = try {
        RandomAccessFile(files.logFile, "r").use { file ->
            // ~200 octets par ligne (encadrés, émojis) : fenêtre lue selon le nombre demandé
            val window = (count * 400L).coerceIn(16 * 1024L, 2 * 1024 * 1024L)
            val start = (file.length() - window).coerceAtLeast(0)
            file.seek(start)
            val bytes = ByteArray((file.length() - start).toInt())
            file.readFully(bytes)
            // Début de fichier coupé : la première ligne est incomplète
            val lines = bytes.decodeToString().lines()
            (if (start > 0) lines.drop(1) else lines).filter { it.isNotBlank() }.takeLast(count)
        }
    } catch (_: Exception) {
        emptyList()
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        files = AppFiles(this)
        Notifications.ensureChannels(this)
        // Le bot pilote sa WebView par le protocole DevTools : réservé à notre
        // propre processus (contrôle de l'UID par Chromium, et SELinux)
        WebView.setWebContentsDebuggingEnabled(true)
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RedPacketBot::bot")
            .apply { setReferenceCounted(false); acquire() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        // Toujours en premier : Android exige startForeground() en quelques secondes
        if (!goForeground(buildNotification("⏳ Démarrage du bot…", "Préparation"))) {
            stopSelfResult(startId)
            return START_NOT_STICKY
        }

        when (intent?.action ?: ACTION_START) {
            ACTION_START -> when {
                intent == null && files.userStopped.exists() ->
                    // Relance automatique d'Android alors que tu avais arrêté le bot
                    finishStopped()
                intent == null && BotState.read(files).optLong("restartAt", 0L) > System.currentTimeMillis() + 5_000 ->
                    // Une relance est déjà programmée (attente, code 78) : c'est l'alarme qui relancera
                    finishWaiting()
                else -> {
                    if (intent != null) cancelStop()
                    startNodeIfNeeded()
                }
            }
            ACTION_TELEGRAM_LOGIN -> {
                cancelStop()
                files.telegramLoginRequest.writeText("1")
                // Nouvelle connexion demandée : l'ancienne session du téléphone est oubliée
                files.telegramSession.delete()
                restartOrStart()
            }
            ACTION_RESTART -> {
                cancelStop()
                restartOrStart()
            }
            ACTION_STOP -> requestStop()
            ACTION_PROMPT_ANSWER -> if (nodeRunning) {
                answerPrompt(
                    intent?.getIntExtra(EXTRA_PROMPT_ID, 0) ?: 0,
                    intent?.getStringExtra(EXTRA_VALUE).orEmpty(),
                )
            } else {
                // Le bot qui posait la question n'existe plus (arrêté, relancé)
                BotState.update(files) { it.remove("prompt") }
                resumeOrStop()
            }
            ACTION_TEST_ALERT -> if (nodeRunning) bridge?.event("test_alert") else resumeOrStop()
            // 📣 Réglages → « Créer mon canal » : ton compte Telegram le crée, ton bot d'alertes y publie
            ACTION_SETUP_CHANNEL -> if (nodeRunning) {
                BotState.update(files) {
                    it.put("channelSetup", JSONObject().put("state", "running").put("at", System.currentTimeMillis()))
                }
                bridge?.event(
                    "publish_setup",
                    JSONObject()
                        .put("title", intent?.getStringExtra(EXTRA_TITLE).orEmpty())
                        .put("username", intent?.getStringExtra(EXTRA_USERNAME).orEmpty()),
                )
            } else {
                resumeOrStop()
            }
            ACTION_CHECK_CHANNEL -> if (nodeRunning) bridge?.event("publish_check") else resumeOrStop()
        }
        return START_STICKY
    }

    /**
     * Démarrer pendant un arrêt en cours : l'arrêt est annulé, et le bot sera
     * relancé dès que l'ancien Node aura fini de s'arrêter.
     */
    private fun cancelStop() {
        files.userStopped.delete()
        if (stopRequested) {
            stopRequested = false
            restartRequested = true
        }
    }

    /** Redémarre le bot s'il tourne, sinon le démarre (sans doublon pendant un démarrage). */
    private fun restartOrStart() {
        when {
            nodeRunning -> requestRestart()
            launching -> restartAfterLaunch = true
            else -> startNodeIfNeeded()
        }
    }

    /** Commande pour un bot qui ne tourne pas dans ce processus : on le relance, ou on s'arrête. */
    private fun resumeOrStop() {
        if (nodeRunning || launching) return
        if (shouldRun(this)) startNodeIfNeeded() else finishStopped(keepUserFlag = true)
    }

    override fun onDestroy() {
        instance = null
        hideFreezeGuard()
        scheduler.shutdownNow()
        bridge?.close()
        devtools?.close()
        claimWebView?.destroy()
        claimWebView = null
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    // ─── Démarrage de Node ──────────────────────────────────────────────────

    private fun startNodeIfNeeded() {
        if (NodeRuntime.started || launching) {
            if (nodeRunning) updateNotification()
            return
        }
        val config = BotConfig.load(files.config)
        if (!config.isComplete) {
            BotState.setStatus(files, BotState.CONFIG_MISSING, "Réglages incomplets : ouvre l'app → Réglages.")
            finishStopped(keepUserFlag = true)
            return
        }

        launching = true
        BotState.setStatus(files, BotState.STARTING, "Démarrage de Node.js…")
        Notifications.cancel(this, Notifications.ID_RESTART)
        // Ce retrait efface aussi chez HiOS l'état « en cours » de la notification
        // du bot (il oublie toutes celles de l'app) : republiée aussitôt, sinon le
        // bot pourrait être gelé pendant son démarrage, écran éteint
        updateNotification()
        main.post { showFreezeGuard() }
        // L'extraction du code (premier lancement, mise à jour) prend quelques secondes
        scheduler.execute {
            try {
                launchNode(config)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Node.js mobile ne se charge pas sur ce téléphone", e)
                BotState.setStatus(files, BotState.STOPPED,
                    "Ce téléphone n'est pas compatible avec Node.js mobile (voir l'écran Santé).")
                main.post { finishStopped() }
            } catch (t: Throwable) {
                Log.e(TAG, "Démarrage de Node impossible", t)
                BotState.setStatus(files, BotState.RESTARTING, "Démarrage impossible : ${t.message}")
                handleNodeExit(1)
            } finally {
                launching = false
            }
            // Redémarrage ou connexion Telegram demandés pendant le démarrage
            if (restartAfterLaunch && nodeRunning) {
                restartAfterLaunch = false
                requestRestart()
            }
        }
    }

    private fun launchNode(config: BotConfig) {
        if (NodeRuntime.started) return
        val project = NodeRuntime.prepareProject(this, files)
        val loginMode = files.telegramLoginRequest.exists()
        files.telegramLoginRequest.delete()

        val newBridge = NodeBridge(File(files.runDir, "bridge.sock"), ::onBridgeMessage).also { it.start() }
        bridge = newBridge
        val devtoolsProxy = DevToolsProxy(File(files.runDir, "devtools.sock")).also { it.start() }
        devtools = devtoolsProxy

        val previous = BotState.read(files)
        val env = JSONObject()
        for ((key, value) in config.toEnv()) env.put(key, value)
        env.put("BOT_PLATFORM", "android")
        env.put("BOT_APP_VERSION", AppVersion.label)
        env.put("BOT_UNATTENDED", "1")
        env.put("BOT_DATA_DIR", files.botData.absolutePath)
        env.put("BOT_HEARTBEAT_FILE", files.heartbeat.absolutePath)
        env.put("BOT_LAST_EXIT_CODE", previous.optInt("lastExitCode", 0).toString())
        env.put("BINANCE_LOGIN_TIMEOUT", "0")
        env.put("TG_SESSION_STORAGE", "string")
        env.put("BOT_TG_LOGIN", if (loginMode) "1" else "")
        env.put("LOG_WIDTH", "48")
        env.put("NO_COLOR", "1")
        env.put("TZ", TimeZone.getDefault().id)
        env.put("RPB_DEVTOOLS_SOCKET", devtoolsProxy.socketFile.absolutePath)
        // Android n'a pas de /tmp : dossiers privés de l'app pour Node et Playwright
        env.put("TMPDIR", File(cacheDir, "tmp").apply { mkdirs() }.absolutePath)
        env.put("HOME", filesDir.absolutePath)
        files.nodeConfig.writeTextAtomic(
            JSONObject().put("bridge", newBridge.socketFile.absolutePath).put("env", env).toString(),
        )
        files.nodeExit.delete()

        nodeStartedAt = System.currentTimeMillis()
        nodeStartedUptime = SystemClock.uptimeMillis()
        lastHeartbeatChangeUptime = nodeStartedUptime
        lastTelegramOkUptime = nodeStartedUptime
        nodeRunning = true
        BotState.update(files) {
            it.put("status", if (loginMode) BotState.TELEGRAM_LOGIN else BotState.RUNNING)
            it.put("message", if (loginMode) "Connexion Telegram : attends le code…" else "")
            it.put("statusSince", nodeStartedAt)
            it.put("nodeStartedAt", nodeStartedAt)
            it.put("restartAt", 0)
            it.remove("prompt")
            // Renvoyés par le bot une fois connecté (telegram_ok) : rien de périmé à l'écran
            it.remove("telegramEvent")
            it.remove("telegramCodeVia")
        }
        NodeRuntime.start(
            arrayOf("node", "--no-warnings", File(project, "entry.js").absolutePath, files.nodeConfig.absolutePath),
        ) { code -> handleNodeExit(code) }

        // Sortie demandée par le bot (process.exit) : lue toutes les 500 ms
        scheduler.scheduleWithFixedDelay({ checkExitFile() }, 500, 500, TimeUnit.MILLISECONDS)
        // Notification, alertes de reconnexion et watchdog : toutes les 15 s
        scheduler.scheduleWithFixedDelay({ watchHeartbeat() }, 5, 15, TimeUnit.SECONDS)
        // Cookies Binance écrits sur disque régulièrement
        scheduler.scheduleWithFixedDelay({ CookieManager.getInstance().flush() }, 5, 5, TimeUnit.MINUTES)
        updateNotification()
    }

    // ─── Pont avec Node ─────────────────────────────────────────────────────

    private fun onBridgeMessage(message: JSONObject) {
        val type = message.optString("t")
        val id = message.optInt("id", 0)
        val data = message.optJSONObject("data") ?: JSONObject()
        when (type) {
            "webview.create" -> main.post {
                try {
                    createClaimWebView(data.getString("url"))
                    bridge?.reply(id)
                } catch (t: Throwable) {
                    bridge?.replyError(id, "WebView impossible : ${t.message}")
                }
            }
            "webview.destroy" -> main.post {
                destroyClaimWebView()
                bridge?.reply(id)
            }
            "webview.pump" -> main.post {
                pumpFrames(data.optLong("ms", PUMP_DEFAULT_MS).coerceIn(0L, PUMP_MAX_MS))
                bridge?.reply(id)
            }
            "prompt" -> onPrompt(id, data.optString("kind"))
            "event" -> onNodeEvent(data)
            else -> if (id != 0) bridge?.replyError(id, "Commande inconnue : $type")
        }
    }

    private fun onPrompt(id: Int, kind: String) {
        pendingPromptId = id
        BotState.update(files) {
            it.put("status", BotState.TELEGRAM_LOGIN)
            it.put("prompt", JSONObject().put("id", id).put("kind", kind))
        }
        val text = if (kind == "telegram_password") {
            "Tape ton mot de passe 2FA Telegram dans l'app."
        } else {
            "Tape le code reçu dans Telegram (ou par SMS) dans l'app."
        }
        Notifications.action(this, Notifications.ID_TELEGRAM, "📱 Connexion Telegram", text,
            Notifications.openApp(this, MainActivity.SCREEN_TELEGRAM, 2))
    }

    private fun clearPrompt() {
        pendingPromptId = 0
        BotState.update(files) { it.remove("prompt") }
        Notifications.cancel(this, Notifications.ID_TELEGRAM)
    }

    private fun answerPrompt(id: Int, value: String) {
        if (id == 0 || id != pendingPromptId) return
        pendingPromptId = 0
        bridge?.reply(id, value)
        BotState.update(files) { it.remove("prompt") }
        Notifications.cancel(this, Notifications.ID_TELEGRAM)
    }

    private fun onNodeEvent(data: JSONObject) {
        when (data.optString("type")) {
            "telegram_code_sent" -> BotState.update(files) {
                it.put("telegramEvent", "code_sent")
                it.put("telegramCodeVia", data.optString("via"))
            }
            "telegram_invalid" -> BotState.update(files) {
                it.put("telegramEvent", "invalid_" + data.optString("kind", "code"))
            }
            "telegram_ok" -> {
                BotState.update(files) {
                    it.remove("lastError")
                    it.put("telegramEvent", "ok")
                    it.put("telegramName", data.optString("name"))
                    it.put("telegramUsername", data.optString("username"))
                    it.put("status", BotState.RUNNING)
                    it.put("message", "")
                    it.remove("prompt")
                }
                Notifications.cancel(this, Notifications.ID_TELEGRAM)
            }
            "fatal" -> BotState.update(files) {
                it.put("lastError", data.optString("message"))
                it.put("lastErrorAt", System.currentTimeMillis())
            }
            "test_alert_result" -> BotState.update(files) {
                it.put("testAlert", if (data.optBoolean("ok")) "ok" else if (data.optBoolean("enabled")) "failed" else "disabled")
                it.put("testAlertAt", System.currentTimeMillis())
            }
            "publish_setup_result" -> {
                // Canal créé : gardé dans les réglages (le bot publie déjà dessus, sans redémarrer)
                val channel = data.optString("channel")
                if (channel.isNotEmpty()) {
                    BotConfig.load(files.config).copy(publishChannel = channel).save(files.config)
                }
                BotState.update(files) {
                    it.put(
                        "channelSetup",
                        JSONObject()
                            .put("state", if (data.optBoolean("ok")) "ok" else "failed")
                            .put("channel", channel)
                            .put("title", data.optString("title"))
                            .put("text", data.optString("text"))
                            .put("at", System.currentTimeMillis()),
                    )
                    if (data.optBoolean("ok")) {
                        it.put("publishCheck", JSONObject().put("ok", true).put("channel", channel).put("text", data.optString("text")))
                    }
                }
            }
            "publish_check_result" -> BotState.update(files) {
                it.put(
                    "publishCheck",
                    JSONObject()
                        .put("ok", data.opt("ok") ?: JSONObject.NULL)
                        .put("channel", data.optString("channel"))
                        .put("text", data.optString("text"))
                        .put("at", System.currentTimeMillis()),
                )
            }
        }
    }

    /** Connexion faite dans l'écran Binance de l'app : le bot recharge sa page. */
    fun onBinanceLoginDone() {
        bridge?.event("binance.loginDone")
        Notifications.cancel(this, Notifications.ID_BINANCE)
    }

    /**
     * 🐦 Notification de l'appli X (XNotificationListener, même processus) :
     * transmise au bot. false si le bot ne tourne pas (rien n'est gardé : le
     * post serait périmé au démarrage).
     */
    fun onXNotification(data: JSONObject): Boolean {
        val target = bridge
        if (!nodeRunning || target == null) return false
        scheduler.execute { target.event("x.post", data) }
        return true
    }

    // ─── WebView de réclamation (jamais affichée) ──────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    private fun createClaimWebView(url: String) {
        destroyClaimWebView()
        val webView = WebView(applicationContext)
        WebViewSetup.configure(webView, this)
        webView.webViewClient = object : WebViewClient() {
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Android a tué la page (mémoire) : le bot en redemande une
                if (view === claimWebView) {
                    claimWebView = null
                    bridge?.event("webview.gone")
                }
                view.destroy()
                return true
            }
        }
        // Jamais attachée à une fenêtre : Chromium la considère visible et ne
        // la gèle pas, même écran éteint. Taille d'un écran d'ordinateur.
        val density = resources.displayMetrics.density
        val width = (1280 * density).toInt()
        val height = (800 * density).toInt()
        webView.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
        )
        webView.layout(0, 0, width, height)
        webView.loadUrl(url)
        claimWebView = webView
        // Chargement de la page Binance : images à cadence normale
        pumpFrames(PUMP_DEFAULT_MS)
    }

    private fun destroyClaimWebView() {
        val webView = claimWebView ?: return
        claimWebView = null
        pumpUntil = 0L
        main.removeCallbacks(pumpTick)
        CookieManager.getInstance().flush()
        webView.stopLoading()
        webView.destroy()
    }

    // ─── Pompe d'images de la WebView de réclamation ───────────────────────
    //
    // Jamais affichée, la WebView ne produit d'elle-même qu'une image toutes les
    // 1 à 2 s (mesuré : 0,7 image/s). Or Chromium attend une image pour traiter
    // chaque clic (4 s par clic) et pour faire avancer les fenêtres de Binance
    // (la fenêtre « Ouvrir » arrivait trop tard). Un dessin logiciel dans une
    // minuscule image force Chromium à produire une image : pendant une
    // réclamation, on en demande une toutes les 33 ms (environ 30 images/s).
    // Tout se passe sur le fil principal (dessin d'une vue Android).

    private var pumpCanvas: Canvas? = null
    @Volatile private var pumpUntil = 0L

    private val pumpTick = object : Runnable {
        override fun run() {
            val webView = claimWebView
            if (webView == null || SystemClock.uptimeMillis() >= pumpUntil) {
                pumpUntil = 0L
                return
            }
            try {
                webView.draw(pumpCanvasFor(webView))
            } catch (e: Exception) {
                Log.w(TAG, "Pompe d'images : ${e.message}")
            }
            main.postDelayed(this, PUMP_INTERVAL_MS)
        }
    }

    /** Petite image (64 × 40) qui reçoit toute la page, réduite : dessin peu coûteux. */
    private fun pumpCanvasFor(webView: WebView): Canvas = pumpCanvas ?: run {
        val bitmap = Bitmap.createBitmap(PUMP_WIDTH_PX, PUMP_HEIGHT_PX, Bitmap.Config.ARGB_8888)
        Canvas(bitmap).apply {
            scale(PUMP_WIDTH_PX / webView.width.coerceAtLeast(1).toFloat(), PUMP_HEIGHT_PX / webView.height.coerceAtLeast(1).toFloat())
        }.also { pumpCanvas = it }
    }

    /** Images à cadence normale pendant [durationMs] (prolonge une pompe en cours). Fil principal. */
    private fun pumpFrames(durationMs: Long) {
        if (durationMs <= 0 || claimWebView == null) return
        val idle = pumpUntil == 0L
        pumpUntil = maxOf(pumpUntil, SystemClock.uptimeMillis() + durationMs)
        if (idle) {
            // Une seule boucle, même si une ancienne attend encore son tour
            main.removeCallbacks(pumpTick)
            main.post(pumpTick)
        }
    }

    // ─── Surveillance ───────────────────────────────────────────────────────

    private fun checkExitFile() {
        if (!files.nodeExit.exists()) return
        val code = try {
            JSONObject(files.nodeExit.readText()).optInt("code", 1)
        } catch (_: Exception) {
            1
        }
        handleNodeExit(code)
    }

    private fun watchHeartbeat() {
        if (!nodeRunning) return
        val heartbeat = Heartbeat.read(files.heartbeat)
        updateNotification(heartbeat)
        // Autorisation donnée (ou retirée) pendant que le bot tourne
        main.post { showFreezeGuard() }

        val browser = heartbeat?.browser.orEmpty()
        if (browser == "login" && lastBrowserState != "login") {
            Notifications.action(this, Notifications.ID_BINANCE, "🔑 Binance : reconnecte-toi",
                "Touche ici pour ouvrir la connexion Binance. Les codes sont ignorés en attendant.",
                Notifications.openBinanceLogin(this))
        } else if (browser != "login" && lastBrowserState == "login") {
            Notifications.cancel(this, Notifications.ID_BINANCE)
        }
        lastBrowserState = browser

        // Watchdog : bot figé (aucun nouveau signe de vie pendant 5 min d'activité
        // du téléphone) → relance. Le temps passé en veille profonde ne compte pas.
        val now = SystemClock.uptimeMillis()
        val ts = heartbeat?.writtenAt ?: 0L
        if (ts != lastHeartbeatTs && ts >= nodeStartedAt) {
            lastHeartbeatTs = ts
            lastHeartbeatChangeUptime = now
        }
        val runningFor = now - nodeStartedUptime
        val silentFor = now - lastHeartbeatChangeUptime
        val waitingForCode = BotState.read(files).has("prompt")
        if (runningFor > FROZEN_AFTER_MS && silentFor > FROZEN_AFTER_MS && !waitingForCode) {
            Log.w(TAG, "Bot figé depuis ${silentFor / 1000} s — relance")
            BotState.update(files) { it.put("message", "Bot figé (aucun signe de vie) : relance.") }
            handleNodeExit(1)
            return
        }

        // Telegram muet 30 min (d'activité) alors qu'Internet marche : la
        // connexion est bloquée, on relance. Pendant une coupure d'Internet,
        // on attend : mtcute se reconnecte seul.
        if (heartbeat == null || heartbeat.telegramOk || !hasInternet()) {
            lastTelegramOkUptime = now
        } else if (now - lastTelegramOkUptime > TELEGRAM_DEAF_MS && !waitingForCode) {
            Log.w(TAG, "Telegram muet depuis ${(now - lastTelegramOkUptime) / 60000} min — relance")
            BotState.update(files) { it.put("message", "Telegram ne répondait plus : relance.") }
            handleNodeExit(1)
        }
    }

    private fun hasInternet(): Boolean {
        val connectivity = getSystemService(ConnectivityManager::class.java)
        val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    // ─── Arrêt et relance ───────────────────────────────────────────────────

    private fun requestStop() {
        files.userStopped.writeText("1")
        stopRequested = true
        if (!nodeRunning) {
            finishStopped(keepUserFlag = true)
            return
        }
        BotState.setStatus(files, BotState.STOPPED, "Arrêt en cours…")
        clearPrompt()
        bridge?.event("shutdown")
        // Arrêt propre : relais « arrêté » publié, codes en file terminés (15 s max)
        scheduler.schedule({ handleNodeExit(0) }, 30, TimeUnit.SECONDS)
    }

    private fun requestRestart() {
        restartRequested = true
        BotState.setStatus(files, BotState.RESTARTING, "Redémarrage…")
        bridge?.event("shutdown")
        scheduler.schedule({ handleNodeExit(0) }, 30, TimeUnit.SECONDS)
    }

    @Synchronized
    private fun handleNodeExit(code: Int) {
        if (exitHandled) return
        exitHandled = true
        val now = System.currentTimeMillis()
        val ranMs = if (nodeStartedAt > 0) now - nodeStartedAt else 0L
        val previous = BotState.read(files)
        BotState.update(files) {
            it.put("lastExitCode", code)
            it.put("lastExitAt", now)
        }
        // La question posée par ce bot (code Telegram) n'a plus de destinataire
        clearPrompt()

        when {
            stopRequested || files.userStopped.exists() -> finishStopped(keepUserFlag = true)
            restartRequested || files.telegramLoginRequest.exists() -> scheduleRestart(1_000, "Redémarrage…")
            code == EXIT_LOGIN_REQUIRED -> {
                BotState.setStatus(files, BotState.TELEGRAM_REQUIRED,
                    "Session Telegram expirée : ouvre 📡 Sources → ✈️ Telegram.")
                Notifications.action(this, Notifications.ID_TELEGRAM, "🔑 Telegram : reconnecte-toi",
                    "La session Telegram du téléphone n'est plus valide. Touche ici puis « Se connecter ».",
                    Notifications.openApp(this, MainActivity.SCREEN_TELEGRAM, 3))
                scheduleRestart(TELEGRAM_RETRY_MS, null)
            }
            else -> {
                val last = previous.optLong("backoffMs", 0L)
                val delay = if (ranMs >= STABLE_RUN_MS || last <= 0) MIN_BACKOFF_MS
                    else (last * 2).coerceAtMost(MAX_BACKOFF_MS)
                BotState.update(files) { it.put("backoffMs", delay) }
                scheduleRestart(delay, "Le bot s'est arrêté (code $code) : relance dans ${delay / 1000} s.")
            }
        }
    }

    /** Programme la relance, puis arrête ce processus (Node ne redémarre pas sur place). */
    private fun scheduleRestart(delayMs: Long, message: String?) {
        val restartAt = System.currentTimeMillis() + delayMs
        BotState.update(files) {
            if (message != null) {
                it.put("status", BotState.RESTARTING)
                it.put("message", message)
            }
            it.put("restartAt", restartAt)
            // Pour savoir si l'alarme a disparu depuis (ensureBotRunning)
            it.put("restartScheduledAt", System.currentTimeMillis())
        }
        val alarm = getSystemService(AlarmManager::class.java)
        val pending = PendingIntent.getBroadcast(
            this, 0, Intent(this, RestartReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val triggerAt = SystemClock.elapsedRealtime() + delayMs
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()) {
            alarm.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
        } else {
            alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
        }
        val notice = restartNotice(restartAt, message)
        getSystemService(NotificationManager::class.java).notify(Notifications.ID_RESTART, notice)
        // Service arrêté AVANT le processus : sans ça, Android le relancerait
        // tout seul (START_STICKY) une seconde plus tard, sans attendre l'alarme
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelfResult(lastStartId)
        repostRestartNotice(notice)
        killSoon(RESTART_NOTICE_REPOST_MS + 300)
    }

    /** Relance relancée trop tôt par Android : on laisse l'alarme faire son travail. */
    private fun finishWaiting() {
        val state = BotState.read(files)
        // Relance Telegram (code 78) : notification sans message, comme dans handleNodeExit
        val message = if (state.optString("status") == BotState.TELEGRAM_REQUIRED) null else state.optString("message")
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelfResult(lastStartId)
        repostRestartNotice(restartNotice(state.optLong("restartAt", 0L), message))
    }

    private fun restartNotice(restartAt: Long, message: String?): Notification {
        val title = if (message == null) "🔑 Telegram à reconnecter" else "♻️ Relance du bot"
        val text = message ?: "Nouvel essai automatique dans 30 min."
        return Notification.Builder(this, Notifications.CHANNEL_BOT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            // Compte à rebours jusqu'à la relance : garde aussi l'app hors du gel HiOS
            // pendant l'attente, sinon l'alarme de relance serait retenue (voir buildNotification)
            .setWhen(restartAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setContentIntent(Notifications.openApp(this))
            .build()
    }

    /**
     * Le retrait de la notification du bot (stopForeground) efface chez HiOS
     * l'état « en cours » de toutes les notifications de l'app, compte à rebours
     * compris. Android le fait un peu plus tard, de son côté : le compte à
     * rebours est donc republié une fois ce retrait passé.
     */
    private fun repostRestartNotice(notice: Notification) {
        main.postDelayed({
            getSystemService(NotificationManager::class.java).notify(Notifications.ID_RESTART, notice)
        }, RESTART_NOTICE_REPOST_MS)
    }

    private fun finishStopped(keepUserFlag: Boolean = false) {
        main.post { hideFreezeGuard() }
        if (!keepUserFlag) files.userStopped.writeText("1")
        val state = BotState.read(files)
        if (state.optString("status") != BotState.CONFIG_MISSING) {
            BotState.setStatus(files, BotState.STOPPED, "Bot arrêté.")
        }
        Notifications.cancel(this, Notifications.ID_RESTART)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // Le dernier ordre reçu seulement : un « Démarrer » arrivé entre-temps n'est pas annulé
        stopSelfResult(lastStartId)
        if (NodeRuntime.started) killSoon()
    }

    private fun killSoon(delayMs: Long = 500) {
        CookieManager.getInstance().flush()
        main.postDelayed({ Process.killProcess(Process.myPid()) }, delayMs)
    }

    // ─── Fenêtre anti-gel (Tecno) ───────────────────────────────────────────
    //
    // HiOS épargne aussi, écran éteint et sans limite de temps, une app qui
    // affiche une fenêtre flottante. Une fenêtre de 1 pixel, transparente et
    // qui laisse passer les appuis, double la protection de la notification
    // (dont la remise à zéro laisse l'app sans protection quelques
    // millisecondes toutes les 4 min). Seulement si « Afficher par-dessus les
    // autres applis » est autorisé : sinon, la notification seule protège.
    // Fil principal seulement.

    private fun showFreezeGuard() {
        if (!Settings.canDrawOverlays(this) || !nodeRunning) {
            // Autorisation retirée, ou bot arrêté
            hideFreezeGuard()
            return
        }
        if (freezeGuard != null) return
        val view = View(this)
        val params = WindowManager.LayoutParams(
            1, 1,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSPARENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            title = "RedPacketBot:freezeGuard"
        }
        try {
            getSystemService(WindowManager::class.java).addView(view, params)
            freezeGuard = view
        } catch (e: Exception) {
            Log.w(TAG, "Fenêtre anti-gel impossible : ${e.message}")
        }
    }

    private fun hideFreezeGuard() {
        val view = freezeGuard ?: return
        freezeGuard = null
        try {
            getSystemService(WindowManager::class.java).removeView(view)
        } catch (_: Exception) {
            /* déjà retirée (autorisation retirée) */
        }
    }

    // ─── Notification permanente ────────────────────────────────────────────

    /** Passe au premier plan. false si Android le refuse (démarrage depuis l'arrière-plan). */
    private fun goForeground(notification: Notification): Boolean {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        return try {
            ServiceCompat.startForeground(this, Notifications.ID_BOT, notification, type)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Premier plan refusé : ${e.message}")
            Notifications.action(this, Notifications.ID_RESTART, "▶️ Relancer le bot",
                "Android n'a pas laissé le bot redémarrer tout seul. Touche ici, puis « Démarrer ». " +
                    "Vérifie l'écran « Santé » (batterie sans restriction).",
                Notifications.openApp(this, MainActivity.SCREEN_HOME, 4))
            false
        }
    }

    private fun updateNotification(heartbeat: Heartbeat? = Heartbeat.read(files.heartbeat)) {
        val state = BotState.read(files)
        val (title, text) = Status.describe(state, heartbeat, nodeRunning)
        val manager = getSystemService(NotificationManager::class.java)
        val notification = buildNotification(title, text)
        // Les deux envois se suivent, sans autre mise à jour entre eux
        synchronized(notificationLock) {
            val now = System.currentTimeMillis()
            if (now - progressRenewedAt >= PROGRESS_RENEW_MS) {
                // HiOS n'épargne une app « en cours » que 5 min après le début de
                // sa progression, puis la gèle quand même (sans fin : jusqu'à
                // l'ouverture de l'app). Une progression terminée (0 sur 0 : aucune
                // barre affichée) efface ce début ; la notification normale envoyée
                // juste après en commence une nouvelle (voir GUIDE-DEBOGAGE.md, partie 4 bis).
                // Entre les deux, l'app n'est plus « en cours » : les deux sont prêtes
                // avant le premier envoi, pour que cet instant soit le plus court possible
                val done = buildNotification(title, text, progressDone = true)
                manager.notify(Notifications.ID_BOT, done)
                progressRenewedAt = now
            }
            manager.notify(Notifications.ID_BOT, notification)
        }
    }

    private fun buildNotification(title: String, text: String, progressDone: Boolean = false): Notification {
        val stop = PendingIntent.getService(
            this, 1, Intent(this, BotService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, Notifications.CHANNEL_BOT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            // Notification dépliée : toute la ligne (gains, anti-ban, X)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            // Chronomètre « en marche depuis » : indispensable sur Tecno (HiOS).
            // Le gel de HiOS (Usf_Hiber) ignore les services de premier plan et gèle
            // l'app (processeur ET réseau) 5 s après la mise en veille ou la sortie de
            // l'app ; il épargne en revanche une app dont une notification affiche un
            // chronomètre ou une progression en cours, pendant 5 min, renouvelées par
            // updateNotification (voir GUIDE-DEBOGAGE.md, parties 4 et 4 bis)
            .setWhen(runningSince)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .apply { if (progressDone) setProgress(0, 0, false) }
            .setContentIntent(Notifications.openApp(this))
            .addAction(Notification.Action.Builder(null, "Arrêter", stop).build())
            .build()
    }
}
