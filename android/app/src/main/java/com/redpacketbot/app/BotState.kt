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
