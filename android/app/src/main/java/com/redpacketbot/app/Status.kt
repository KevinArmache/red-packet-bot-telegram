package com.redpacketbot.app

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Couleur d'un état à l'écran. */
enum class Tone { OK, INFO, BUSY, IDLE, WARN, DANGER }

/**
 * État du bot structuré, pour l'écran d'accueil (bouton d'état animé).
 * @property phase active, standby, checking, starting, restarting, stopped, config,
 *   telegram_login, telegram_required, binance_login, paused ou halted
 */
data class BotStatus(
    val phase: String,
    val tone: Tone,
    val emoji: String,
    val title: String,
    val detail: String,
)

/** Texte de l'état du bot, pour la notification et l'écran d'accueil. */
object Status {

    /** Même texte que [describe], découpé et classé pour l'écran d'accueil. */
    fun model(state: JSONObject, heartbeat: Heartbeat?, nodeRunning: Boolean = true): BotStatus {
        val (full, detail) = describe(state, heartbeat, nodeRunning)
        val phase = when (state.optString("status", BotState.STOPPED)) {
            BotState.STOPPED -> "stopped"
            BotState.CONFIG_MISSING -> "config"
            BotState.STARTING -> "starting"
            BotState.RESTARTING -> "restarting"
            BotState.TELEGRAM_LOGIN -> "telegram_login"
            BotState.TELEGRAM_REQUIRED -> "telegram_required"
            else -> when {
                !nodeRunning || heartbeat == null -> "starting"
                heartbeat.browser == "login" -> "binance_login"
                heartbeat.pauseUntil > System.currentTimeMillis() -> "paused"
                heartbeat.antiban == "halt" -> "halted"
                heartbeat.mode == "standby" -> "standby"
                heartbeat.mode == "checking" -> "checking"
                else -> "active"
            }
        }
        val tone = when (phase) {
            "active" -> Tone.OK
            "standby", "checking" -> Tone.INFO
            "starting", "restarting", "telegram_login" -> Tone.BUSY
            "stopped" -> Tone.IDLE
            "config" -> Tone.WARN
            else -> Tone.DANGER
        }
        return BotStatus(phase, tone, full.substringBefore(' '), full.substringAfter(' '), detail)
    }

    fun describe(state: JSONObject, heartbeat: Heartbeat?, nodeRunning: Boolean = true): Pair<String, String> {
        val message = state.optString("message")
        return when (state.optString("status", BotState.STOPPED)) {
            BotState.STOPPED -> "⏹️ Bot arrêté" to message.ifEmpty { "Touche « Démarrer » dans l'app." }
            BotState.CONFIG_MISSING -> "⚙️ Réglages à compléter" to message
            BotState.STARTING -> "⏳ Démarrage du bot…" to message
            BotState.RESTARTING -> "♻️ Relance du bot" to restartText(state, message)
            BotState.TELEGRAM_LOGIN -> "📱 Connexion Telegram" to
                if (state.has("prompt")) "Code demandé : ouvre l'app pour le saisir." else "Envoi du code…"
            BotState.TELEGRAM_REQUIRED -> "🔑 Telegram à reconnecter" to restartText(state, message)
            else -> if (nodeRunning) running(heartbeat) else ("⏳ Démarrage du bot…" to "")
        }
    }

    private fun running(heartbeat: Heartbeat?): Pair<String, String> {
        if (heartbeat == null) return "🟢 Bot en marche" to "Connexion à Telegram…"
        val now = System.currentTimeMillis()
        val paused = heartbeat.pauseUntil > now
        val title = when {
            heartbeat.browser == "login" -> "🔑 Binance à reconnecter"
            paused -> "🛑 Pause anti-ban"
            heartbeat.antiban == "halt" -> "⛔ Arrêt anti-blocage"
            heartbeat.mode == "standby" -> "😴 En veille — le PC réclame"
            heartbeat.mode == "checking" -> "🔎 Vérification du relais…"
            heartbeat.mode == "active" && heartbeat.browser == "starting" -> "⏳ Ouverture de Binance…"
            heartbeat.mode == "active" -> "🟢 Actif — le téléphone réclame"
            else -> "🟢 Bot en marche"
        }
        val parts = mutableListOf("🎁 ${heartbeat.detected} code(s)", "💰 ${heartbeat.won} gagné(s)")
        if (paused) parts += "reprise à ${time(heartbeat.pauseUntil)}"
        when (heartbeat.antiban) {
            "halt" -> parts += "${heartbeat.fails} faux d'affilée : envoie #reprendre sur Telegram"
            "selective" -> parts += "🟠 codes clairs seulement (${heartbeat.fails} faux d'affilée)"
            else -> parts += "🛡️ anti-ban ${heartbeat.fails}/10"
        }
        if (heartbeat.xOn) parts += if (heartbeat.xDryRun) "🐦 X (essai à blanc)" else "🐦 X actif"
        return title to parts.joinToString(" · ")
    }

    private fun restartText(state: JSONObject, message: String): String {
        val restartAt = state.optLong("restartAt", 0L)
        if (restartAt <= 0) return message
        val seconds = ((restartAt - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
        val next = if (seconds < 120) "$seconds s" else "${seconds / 60} min"
        return listOf(message, "Prochain essai dans $next.").filter { it.isNotBlank() }.joinToString(" ")
    }

    /** Dernière erreur grave du bot (moins de 6 h), expliquée en clair ; null sinon. */
    fun lastError(state: JSONObject): String? {
        val message = state.optString("lastError")
        val at = state.optLong("lastErrorAt", 0L)
        if (message.isBlank() || System.currentTimeMillis() - at > 6 * 3_600_000L) return null
        return when {
            "API_ID_INVALID" in message || "API_HASH" in message ->
                "API_ID ou API_HASH refusé par Telegram : recopie-les depuis my.telegram.org (onglet Réglages)."
            "PHONE_NUMBER_INVALID" in message ->
                "Numéro refusé par Telegram : vérifie-le dans les Réglages (format +243…)."
            "PHONE_NUMBER_BANNED" in message -> "Ce numéro est banni par Telegram."
            "PHONE_CODE_EXPIRED" in message -> "Code expiré : recommence la connexion Telegram."
            "FLOOD_WAIT" in message -> "Telegram demande d'attendre avant un nouvel essai : réessaie plus tard."
            else -> "Dernière erreur : $message"
        }
    }

    fun time(ms: Long): String = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(ms))

    fun dateTime(ms: Long): String = SimpleDateFormat("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE).format(Date(ms))

    fun ago(ms: Long): String {
        val seconds = (ms / 1000).coerceAtLeast(0)
        return when {
            seconds < 90 -> "$seconds s"
            seconds < 5400 -> "${seconds / 60} min"
            else -> "${seconds / 3600} h"
        }
    }
}
