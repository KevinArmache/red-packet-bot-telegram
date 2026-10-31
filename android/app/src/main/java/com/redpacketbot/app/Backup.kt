package com.redpacketbot.app

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 🧳 Sauvegarde de l'app, pour tout retrouver sur un nouveau téléphone :
 * réglages, historique des codes (48 h), compteur anti-blocage, gains et
 * stats, destinataire des alertes, devise.
 *
 * Ton bot d'alertes te l'envoie tout seul (fichier épinglé dans sa
 * discussion, remplacé à chaque changement). Sur le nouveau téléphone :
 * toucher le fichier → « Ouvrir avec » → Red Packet Bot.
 *
 * Jamais dedans : la session Telegram (tu te reconnectes avec le code) ni
 * les cookies Binance (Binance lie sa session à l'appareil).
 */
object Backup {
    const val VERSION = 1
    const val FILE_NAME = "RedPacketBot-sauvegarde.rpb"
    /** Taille maximale lue pour un fichier partagé (sauvegarde ou .env). */
    const val MAX_BYTES = 2_000_000

    private const val DAY_MS = 24 * 3600_000L

    /** Fichiers du bot (BOT_DATA_DIR) repris tels quels : jamais un autre chemin. */
    private val BOT_FILES = listOf(
        "history.json", ".run/antiban.json", ".run/activity.json", ".run/square.json", ".run/square-marks.json", ".alert-chat-id",
    )

    // ─── Contenu ────────────────────────────────────────────────────────────

    fun isBackup(text: String?): Boolean =
        text != null && text.trimStart().startsWith("{") && text.contains("\"rpbBackup\"")

    /** Sauvegarde lisible par cette version de l'app, ou null. */
    fun parse(text: String?): JSONObject? = runCatching {
        JSONObject(text.orEmpty()).takeIf { it.optInt("rpbBackup") in 1..VERSION && it.optJSONObject("config") != null }
    }.getOrNull()

    fun build(context: Context, files: AppFiles): JSONObject {
        val ui = context.getSharedPreferences("ui", Context.MODE_PRIVATE)
        val botFiles = JSONObject()
        for (name in BOT_FILES) {
            val file = File(files.botData, name)
            if (file.isFile) botFiles.put(name, file.readText())
        }
        return JSONObject()
            .put("rpbBackup", VERSION)
            .put("createdAt", System.currentTimeMillis())
            .put("appVersion", AppVersion.label)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("config", BotConfig.load(files.config).toJson())
            .put("files", botFiles)
            .put(
                "ui",
                JSONObject().apply {
                    ui.getString("currency", null)?.let { put("currency", it) }
                    ui.getString("cdfManualRate", null)?.let { put("cdfManualRate", it) }
                    put("cdfAutoRate", ui.getFloat("cdfAutoRate", 0f).toDouble())
                    put("cdfAutoRateAt", ui.getLong("cdfAutoRateAt", 0L))
                },
            )
    }

    /** Empreinte du contenu, sans la date : une sauvegarde identique n'est pas renvoyée. */
    private fun fingerprint(backup: JSONObject): String =
        sha256(JSONObject(backup.toString()).apply { remove("createdAt") }.toString())

    private fun sha256(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun formatDate(at: Long): String = SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE).format(Date(at))

    /** « Sauvegarde du 27/10 13:45 (TECNO CM5) · 17 canaux · X activé · canal @… · ≈ 0,52 $ gagnés » */
    fun summary(backup: JSONObject): String {
        val config = BotConfig.fromJson(backup.getJSONObject("config"))
        val gainsUsd = runCatching {
            JSONObject(backup.optJSONObject("files")?.optString(".run/activity.json").orEmpty())
                .optJSONObject("gains")?.optDouble("totalUsd")
        }.getOrNull()?.takeIf { !it.isNaN() && it > 0 }
        return listOfNotNull(
            "Sauvegarde du ${formatDate(backup.optLong("createdAt"))} (${backup.optString("device", "?")})",
            "${config.channelList.size} canal(aux)",
            if (config.xEnabled) "X activé" else null,
            config.publishChannel.takeIf { it.isNotBlank() }?.let { "canal ${BotConfig.normalizedChannel(it)}" },
            gainsUsd?.let { "≈ ${String.format(Locale.FRANCE, "%.2f", it)} $ gagnés" },
        ).joinToString(" · ")
    }

    /**
     * Remet tout en place. Le bot doit être arrêté : sinon il réécrirait ses
     * fichiers en s'arrêtant. L'assistant 🧭 se rouvrira (connexions à refaire).
     */
    fun restore(context: Context, files: AppFiles, backup: JSONObject) {
        BotConfig.fromJson(backup.getJSONObject("config")).save(files.config)
        val botFiles = backup.optJSONObject("files") ?: JSONObject()
        for (name in BOT_FILES) {
            if (botFiles.has(name)) File(files.botData, name).writeTextAtomic(botFiles.getString(name))
        }
        val ui = backup.optJSONObject("ui") ?: JSONObject()
        context.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().apply {
            ui.optString("currency").takeIf { it.isNotEmpty() }?.let { putString("currency", it) }
            ui.optString("cdfManualRate").takeIf { it.isNotEmpty() }?.let { putString("cdfManualRate", it) }
            ui.optDouble("cdfAutoRate").takeIf { !it.isNaN() && it > 0 }?.let { putFloat("cdfAutoRate", it.toFloat()) }
            putLong("cdfAutoRateAt", ui.optLong("cdfAutoRateAt", 0L))
            putBoolean("wizardDone", false)
        }.apply()
    }

    // ─── État de l'envoi (fichier : lu par l'interface ET le processus :bot) ─

    private fun stateFile(files: AppFiles) = File(files.runDir, "backup.json")

    fun state(files: AppFiles): JSONObject = runCatching { JSONObject(stateFile(files).readText()) }.getOrElse { JSONObject() }

    private fun updateState(files: AppFiles, change: (JSONObject) -> Unit) {
        val state = state(files)
        change(state)
        stateFile(files).writeTextAtomic(state.toString())
    }

    fun isAuto(files: AppFiles): Boolean = state(files).optBoolean("auto", true)

    fun setAuto(files: AppFiles, auto: Boolean) = updateState(files) { it.put("auto", auto) }

    // ─── Envoi par ton bot d'alertes ────────────────────────────────────────

    /**
     * Envoie la sauvegarde dans ta discussion avec ton bot d'alertes, l'épingle
     * et retire l'ancienne. Sans `force` (envoi automatique) : seulement si les
     * réglages ont changé, ou une fois par jour si le reste a changé.
     * @return le message à afficher, ou null si rien n'a été tenté.
     */
    @Synchronized
    fun send(context: Context, files: AppFiles, force: Boolean): String? {
        if (!force && !isAuto(files)) return null
        val config = BotConfig.load(files.config)
        val token = config.alertBotToken.trim()
        val chatId = config.alertChatId.trim().ifEmpty {
            runCatching { File(files.botData, ".alert-chat-id").readText().trim() }.getOrDefault("")
        }
        if (token.isEmpty()) return if (force) fail(files, "il faut le jeton du bot d'alertes (carte 🔔)") else null
        if (chatId.isEmpty()) {
            return if (force) fail(files, "destinataire inconnu : il est appris à la première connexion Telegram") else null
        }

        val backup = build(context, files)
        val hash = fingerprint(backup)
        val configHash = sha256(backup.getJSONObject("config").toString())
        val previous = state(files)
        if (!force) {
            if (hash == previous.optString("hash")) return null
            val configChanged = configHash != previous.optString("configHash")
            val recent = System.currentTimeMillis() - previous.optLong("sentAt", 0L) < DAY_MS
            if (!configChanged && recent) return null
        }

        val now = System.currentTimeMillis()
        val caption = "🧳 Sauvegarde de Red Packet Bot — ${formatDate(now)}\n" +
            "Téléphone perdu ? Installe l'app, puis touche ce fichier → « Ouvrir avec » → Red Packet Bot : " +
            "tous tes réglages reviennent. Il ne restera qu'à reconnecter Telegram et Binance.\n" +
            "⚠️ Il contient tes secrets (comme ton .env) : ne le transfère à personne."
        val sent = upload(token, chatId, caption, backup.toString(2).toByteArray())
        if (!sent.optBoolean("ok")) return fail(files, sent.optString("description", "envoi impossible"))

        val message = sent.optJSONObject("result")
        val messageId = message?.optLong("message_id") ?: 0L
        val bot = message?.optJSONObject("from")?.optString("username")?.takeIf { it.isNotEmpty() }?.let { "@$it" } ?: "ton bot"
        call(token, "pinChatMessage", JSONObject().put("chat_id", chatId).put("message_id", messageId).put("disable_notification", true))
        val oldId = previous.optLong("messageId", 0L)
        if (oldId > 0 && oldId != messageId) {
            call(token, "unpinChatMessage", JSONObject().put("chat_id", chatId).put("message_id", oldId))
            // Refusé par Telegram après 48 h : l'ancien fichier reste, mais n'est plus épinglé
            call(token, "deleteMessage", JSONObject().put("chat_id", chatId).put("message_id", oldId))
        }
        updateState(files) {
            it.put("hash", hash)
            it.put("configHash", configHash)
            it.put("sentAt", now)
            it.put("messageId", messageId)
            it.put("bot", bot)
            it.remove("error")
            it.remove("errorAt")
        }
        return "✅ Sauvegarde envoyée par $bot le ${formatDate(now)} (épinglée dans sa discussion)"
    }

    private fun fail(files: AppFiles, reason: String): String {
        updateState(files) {
            it.put("error", reason)
            it.put("errorAt", System.currentTimeMillis())
        }
        return "⚠️ Sauvegarde non envoyée : $reason"
    }

    /** Ligne d'état pour l'app : dernier envoi réussi, ou dernier échec. */
    fun describe(state: JSONObject): String? {
        val sentAt = state.optLong("sentAt", 0L)
        val errorAt = state.optLong("errorAt", 0L)
        return when {
            errorAt > sentAt -> "⚠️ Dernier envoi raté (${formatDate(errorAt)}) : ${state.optString("error")}"
            sentAt > 0 -> "✅ Dernière sauvegarde envoyée par ${state.optString("bot", "ton bot")} le ${formatDate(sentAt)}"
            else -> null
        }
    }

    // ─── API Bot ────────────────────────────────────────────────────────────

    private fun upload(token: String, chatId: String, caption: String, bytes: ByteArray): JSONObject = request {
        val boundary = "rpb${System.nanoTime()}"
        val connection = open(token, "sendDocument")
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        connection.outputStream.use { out ->
            fun line(text: String) = out.write("$text\r\n".toByteArray())
            for ((name, value) in listOf("chat_id" to chatId, "caption" to caption, "disable_notification" to "true")) {
                line("--$boundary")
                line("Content-Disposition: form-data; name=\"$name\"")
                line("")
                line(value)
            }
            line("--$boundary")
            line("Content-Disposition: form-data; name=\"document\"; filename=\"$FILE_NAME\"")
            line("Content-Type: application/octet-stream")
            line("")
            out.write(bytes)
            line("")
            line("--$boundary--")
        }
        connection
    }

    private fun call(token: String, method: String, params: JSONObject): JSONObject = request {
        val connection = open(token, method)
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(params.toString().toByteArray()) }
        connection
    }

    private fun open(token: String, method: String) =
        (URL("https://api.telegram.org/bot$token/$method").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 30_000
        }

    /** Réponse de l'API Bot ; jamais d'exception (réseau coupé = ok:false). */
    private fun request(send: () -> HttpURLConnection): JSONObject = try {
        val connection = send()
        try {
            val stream = if (connection.responseCode < 400) connection.inputStream else connection.errorStream
            JSONObject(stream?.use { it.readBytes().decodeToString() } ?: "{}")
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        JSONObject().put("ok", false).put("description", "réseau indisponible (${e.javaClass.simpleName})")
    }
}
