package com.redpacketbot.app.ui

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.redpacketbot.app.ActivityLog
import com.redpacketbot.app.AppFiles
import com.redpacketbot.app.Backup
import com.redpacketbot.app.BotConfig
import com.redpacketbot.app.BotService
import com.redpacketbot.app.BotState
import com.redpacketbot.app.Health
import com.redpacketbot.app.Heartbeat
import com.redpacketbot.app.XListenerState
import com.redpacketbot.app.XNotificationListener
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Ce que l'interface sait du bot (relu toutes les secondes). */
data class Snapshot(
    val state: JSONObject,
    val heartbeat: Heartbeat?,
    val config: BotConfig,
    val hasTelegramSession: Boolean,
    val userStopped: Boolean,
    val activity: ActivityLog,
    val xListener: XListenerState,
    val xAccess: Boolean,
    /** 🧳 Dernier envoi de la sauvegarde par ton bot (Backup.state). */
    val backup: JSONObject = JSONObject(),
) {
    val status: String get() = state.optString("status", BotState.STOPPED)

    /**
     * Le bot tourne (ou démarre) dans le processus « :bot ». Un état « en
     * marche » sans signe de vie depuis 5 min veut dire que le processus a
     * été tué : l'écran propose alors de le démarrer.
     */
    val isRunning: Boolean
        get() {
            if (userStopped) return false
            return when (status) {
                BotState.STARTING, BotState.TELEGRAM_LOGIN -> true
                BotState.RUNNING -> {
                    val since = maxOf(state.optLong("statusSince", 0L), heartbeat?.writtenAt ?: 0L)
                    System.currentTimeMillis() - since < 5 * 60_000L
                }
                else -> false
            }
        }

    /** Signe de vie du bot en marche (null s'il est arrêté : chiffres périmés). */
    val liveHeartbeat: Heartbeat? get() = heartbeat?.takeIf { isRunning }

    /** Arrêter / redémarrer a un sens (bot en marche ou en attente de relance). */
    val canStop: Boolean
        get() = isRunning || status == BotState.RESTARTING || status == BotState.TELEGRAM_REQUIRED

    val prompt: JSONObject? get() = state.optJSONObject("prompt")

    val telegramOk: Boolean get() = hasTelegramSession && status != BotState.TELEGRAM_REQUIRED
}

/** Réglages du téléphone vérifiés pour l'écran Santé (et le score de l'accueil). */
data class HealthReport(val items: List<Health.Item> = emptyList(), val manual: Map<String, Boolean> = emptyMap()) {
    fun isDone(item: Health.Item): Boolean? = item.ok ?: if (manual[item.key] == true) true else null
    val okCount: Int get() = items.count { isDone(it) == true }
    val total: Int get() = items.size
    val criticalMissing: Int get() = items.count { it.critical && it.ok == false }
}

class BotViewModel(app: Application) : AndroidViewModel(app) {
    private val files = AppFiles(app)
    private val healthPrefs = app.getSharedPreferences("health", Context.MODE_PRIVATE)
    private val uiPrefs = app.getSharedPreferences("ui", Context.MODE_PRIVATE)
    @Volatile private var lastActivity: ActivityLog? = null

    val snapshot: StateFlow<Snapshot> = flow {
        while (true) {
            emit(load())
            delay(1000)
        }
    }.flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), load())

    private val healthTrigger = MutableStateFlow(0)

    /** Revérifié toutes les 10 s, et tout de suite au retour dans l'app ([refreshHealth]). */
    @OptIn(ExperimentalCoroutinesApi::class)
    val health: StateFlow<HealthReport> = healthTrigger.flatMapLatest {
        flow {
            while (true) {
                emit(checkHealth())
                delay(10_000)
            }
        }
    }.flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HealthReport())

    private fun load(): Snapshot {
        val activity = ActivityLog.read(files.activity, lastActivity).also { lastActivity = it }
        return Snapshot(
            state = BotState.read(files),
            heartbeat = Heartbeat.read(files.heartbeat),
            config = BotConfig.load(files.config),
            hasTelegramSession = files.telegramSession.exists(),
            userStopped = files.userStopped.exists(),
            activity = activity,
            xListener = XListenerState.read(files.xListener),
            xAccess = XNotificationListener.isAccessGranted(getApplication()),
            backup = Backup.state(files),
        )
    }

    private fun checkHealth(): HealthReport {
        val items = Health.check(getApplication())
        return HealthReport(items, items.associate { it.key to healthPrefs.getBoolean(it.key, false) })
    }

    fun refreshHealth() {
        healthTrigger.value++
    }

    /** Point à vérifier à la main (Tecno) : coché par toi. */
    fun setManualDone(key: String, done: Boolean) {
        healthPrefs.edit().putBoolean(key, done).apply()
        refreshHealth()
    }

    // ─── Devise d'affichage (💱 Réglages) ───────────────────────────────────

    private val _money = MutableStateFlow(loadMoney())
    val money: StateFlow<MoneyPrefs> = _money

    init {
        refreshCdfRate()
    }

    private fun loadMoney() = MoneyPrefs(
        mode = uiPrefs.getString("currency", MoneyPrefs.USD) ?: MoneyPrefs.USD,
        manualRate = uiPrefs.getString("cdfManualRate", null)?.toDoubleOrNull()?.takeIf { it > 0 },
        autoRate = uiPrefs.getFloat("cdfAutoRate", 0f).toDouble().takeIf { it > 0 },
        autoRateAt = uiPrefs.getLong("cdfAutoRateAt", 0L),
    )

    fun setCurrency(mode: String) {
        uiPrefs.edit().putString("currency", mode).apply()
        _money.value = loadMoney()
        refreshCdfRate()
    }

    /** Taux saisi (FC pour 1 $) ; vide = taux du jour. */
    fun setManualRate(text: String) {
        // « 2 850 », « 2850,5 » : espaces ignorés, virgule décimale acceptée
        val rate = text.filter { it.isDigit() || it == ',' || it == '.' }.replace(',', '.').toDoubleOrNull()
            ?.takeIf { it > 0 }
        uiPrefs.edit().apply {
            if (rate == null) remove("cdfManualRate") else putString("cdfManualRate", rate.toString())
        }.apply()
        _money.value = loadMoney()
    }

    /**
     * Taux du jour dollar → franc congolais (open.er-api.com, gratuit, sans
     * clé, mis à jour chaque jour) : relu au plus toutes les 6 h, et seulement
     * si les francs sont affichés.
     */
    fun refreshCdfRate(force: Boolean = false) {
        val current = _money.value
        if (!current.wantsCdf) return
        if (!force && current.autoRate != null && System.currentTimeMillis() - current.autoRateAt < 6 * 3_600_000L) return
        viewModelScope.launch(Dispatchers.IO) {
            val rate = fetchCdfRate() ?: return@launch
            uiPrefs.edit()
                .putFloat("cdfAutoRate", rate.toFloat())
                .putLong("cdfAutoRateAt", System.currentTimeMillis())
                .apply()
            _money.value = loadMoney()
        }
    }

    private fun fetchCdfRate(): Double? = try {
        val connection = URL("https://open.er-api.com/v6/latest/USD").openConnection() as HttpURLConnection
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        try {
            val body = connection.inputStream.use { it.readBytes().decodeToString() }
            JSONObject(body).optJSONObject("rates")?.optDouble("CDF")?.takeIf { !it.isNaN() && it > 0 }
        } finally {
            connection.disconnect()
        }
    } catch (_: Exception) {
        null
    }

    // ─── Assistant de démarrage ────────────────────────────────────────────

    var wizardDone: Boolean
        get() = uiPrefs.getBoolean("wizardDone", false)
        set(value) = uiPrefs.edit().putBoolean("wizardDone", value).apply()

    // ─── Commandes du bot (mêmes actions qu'avant la refonte) ─────────────

    fun start() = send(BotService.ACTION_START)
    fun stop() = send(BotService.ACTION_STOP)
    fun restart() = send(BotService.ACTION_RESTART)
    fun testAlert() = send(BotService.ACTION_TEST_ALERT)
    fun checkChannel() = send(BotService.ACTION_CHECK_CHANNEL)

    /** 📣 Crée ton canal (ton compte Telegram) et y met ton bot d'alertes administrateur. */
    fun setupChannel(title: String, username: String) = send(BotService.ACTION_SETUP_CHANNEL) {
        putExtra(BotService.EXTRA_TITLE, title)
        putExtra(BotService.EXTRA_USERNAME, username)
    }
    fun telegramLogin() = send(BotService.ACTION_TELEGRAM_LOGIN)

    fun answerPrompt(id: Int, value: String) = send(BotService.ACTION_PROMPT_ANSWER) {
        putExtra(BotService.EXTRA_PROMPT_ID, id)
        putExtra(BotService.EXTRA_VALUE, value)
    }

    /** Enregistre les réglages ; le bot redémarre s'il tourne. @return true s'il redémarre. */
    fun saveConfig(config: BotConfig): Boolean {
        config.save(files.config)
        val running = snapshot.value.isRunning
        if (running) restart()
        return running
    }

    fun loadConfig(): BotConfig = BotConfig.load(files.config)

    // ─── 🧳 Sauvegarde ─────────────────────────────────────────────────────

    fun setBackupAuto(auto: Boolean) = Backup.setAuto(files, auto)

    /** Envoi tout de suite par ton bot d'alertes (même sans changement). */
    fun sendBackupNow(onDone: (String) -> Unit) = viewModelScope.launch {
        onDone(withContext(Dispatchers.IO) { Backup.send(getApplication(), files, force = true) }.orEmpty())
    }

    /** Fichier de sauvegarde écrit où tu l'as choisi (Drive, Téléchargements…). */
    fun exportBackup(uri: Uri, onDone: (String) -> Unit) = viewModelScope.launch {
        onDone(
            withContext(Dispatchers.IO) {
                runCatching {
                    val text = Backup.build(getApplication(), files).toString(2)
                    getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray()) }
                    "💾 Sauvegarde enregistrée : garde-la en lieu sûr (elle contient tes secrets)."
                }.getOrElse { "⚠️ Enregistrement impossible : ${it.message}" }
            },
        )
    }

    /**
     * Remet en place une sauvegarde. Le bot est d'abord arrêté (40 s au plus),
     * sinon il réécrirait ses fichiers en s'arrêtant.
     */
    fun restoreBackup(backup: JSONObject, onDone: (String) -> Unit) = viewModelScope.launch {
        val message = withContext(Dispatchers.IO) {
            if (snapshot.value.isRunning) {
                send(BotService.ACTION_STOP)
                for (attempt in 0 until 80) {
                    val state = BotState.read(files)
                    val stopping = state.optString("message").startsWith("Arrêt en cours")
                    if (state.optString("status") == BotState.STOPPED && !stopping) break
                    delay(500)
                }
            }
            runCatching {
                Backup.restore(getApplication(), files, backup)
                "🧳 Sauvegarde restaurée : reconnecte Telegram et Binance, puis démarre le bot."
            }.getOrElse { "⚠️ Restauration impossible : ${it.message}" }
        }
        _money.value = loadMoney()
        onDone(message)
    }

    private fun send(action: String, extras: Intent.() -> Unit = {}) =
        BotService.send(getApplication(), action, extras)
}
