package com.redpacketbot.app

import org.json.JSONObject
import java.io.File

/**
 * État du bot, écrit par le service (processus « :bot ») dans run/state.json
 * et lu par l'interface toutes les secondes.
 */
object BotState {
    const val STOPPED = "stopped"
    const val STARTING = "starting"
    const val RUNNING = "running"
    const val RESTARTING = "restarting"
    const val TELEGRAM_LOGIN = "telegram_login"
    const val TELEGRAM_REQUIRED = "telegram_required"
    const val CONFIG_MISSING = "config_missing"

    fun read(files: AppFiles): JSONObject = try {
        JSONObject(files.state.readText())
    } catch (_: Exception) {
        JSONObject()
    }

    @Synchronized
    fun update(files: AppFiles, change: (JSONObject) -> Unit) {
        val state = read(files)
        change(state)
        state.put("updatedAt", System.currentTimeMillis())
        files.state.writeTextAtomic(state.toString())
    }

    fun setStatus(files: AppFiles, status: String, message: String = "") = update(files) {
        it.put("status", status)
        it.put("message", message)
        it.put("statusSince", System.currentTimeMillis())
    }
}

/** Signe de vie du bot (fichier BOT_HEARTBEAT_FILE, réécrit toutes les 15 s). */
class Heartbeat(private val values: Map<String, String>, val writtenAt: Long) {
    val ageMs: Long get() = System.currentTimeMillis() - writtenAt
    val role get() = values["role"] ?: ""
    val mode get() = values["mode"] ?: ""
    val browser get() = values["browser"] ?: ""
    val detected get() = values["detected"]?.toIntOrNull() ?: 0
    val won get() = values["won"]?.toIntOrNull() ?: 0
    val sleeps get() = values["sleeps"]?.toIntOrNull() ?: 0
    val disconnects get() = values["disconnects"]?.toIntOrNull() ?: 0
    val messages get() = values["messages"]?.toIntOrNull() ?: 0
    val pauseUntil get() = values["pause_until"]?.toLongOrNull() ?: 0L
    /** Anti-blocage : normal, selective (codes clairs seulement), halt (⛔) ou lock (blocage Binance). */
    val antiban get() = values["antiban"] ?: "normal"
    /** Codes faux d'affilée (Binance bloque au 10e). */
    val fails get() = values["fails"]?.toIntOrNull() ?: 0
    val startedAt get() = values["started_at"]?.toLongOrNull() ?: 0L
    /** Telegram répond (vérification toutes les 3 min dans le bot). */
    val telegramOk get() = values["tg_ok"] != "0"
    val lastCodeAt get() = long("last_code_at")

    // Écran d'accueil (bot de la version 2) : 0 / vide avec un bot plus ancien
    val failed get() = int("failed")
    val guarded get() = int("guarded")
    val deferred get() = int("deferred")
    val skipped get() = int("skipped")
    val claimed get() = int("claimed")
    /** Délai moyen entre la détection d'un code et sa saisie (ms). */
    val avgWaitMs get() = long("avg_wait_ms")
    /** Seuil « codes clairs seulement » (0 = jamais). */
    val selectiveAt get() = values["sel_at"]?.toIntOrNull() ?: 8
    /** Seuil d'arrêt ⛔ (0 = mode léger, pas d'arrêt). */
    val stopAt get() = values["stop_at"]?.toIntOrNull() ?: 9
    /** L'autre appareil vu par le relais : active, standby, pause, stopped, unavailable… */
    val peerState get() = values["peer_state"] ?: ""
    val peerAt get() = long("peer_at")
    val xOn get() = values["x_on"] == "1"
    val xDryRun get() = values["x_dry"] == "1"
    val xSeen get() = int("x_seen")
    val xCodes get() = int("x_codes")
    val xLastAt get() = long("x_last_at")
    val xLastFrom get() = values["x_last_from"] ?: ""
    /** Codes du dernier post X, dont déjà traités plus tôt (Telegram ou X). */
    val xLastFound get() = int("x_last_found")
    val xLastKnown get() = int("x_last_known")

    private fun int(key: String) = values[key]?.toIntOrNull() ?: 0
    private fun long(key: String) = values[key]?.toLongOrNull() ?: 0L

    companion object {
        fun read(file: File): Heartbeat? = try {
            val values = file.readLines()
                .mapNotNull { line -> line.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }
                .toMap()
            val ts = values["ts"]?.toLongOrNull() ?: file.lastModified()
            Heartbeat(values, ts)
        } catch (_: Exception) {
            null
        }
    }
}
