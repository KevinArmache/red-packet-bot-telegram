package com.redpacketbot.app

import org.json.JSONObject
import java.io.File

/**
 * Réglages du bot sur le téléphone. Mêmes noms que le .env du PC : un .env
 * peut être importé tel quel (le rôle reste « backup » sur le téléphone).
 */
data class BotConfig(
    val apiId: String = "",
    val apiHash: String = "",
    val phoneNumber: String = "",
    val targetChannels: String = "",
    val alertBotToken: String = "",
    val notifyLevel: String = "all",
    val alertChatId: String = "",
    // 📣 Gains publiés sur ton canal par le bot d'alertes (src/publisher.js)
    val publishChannel: String = "",
    val botRole: String = "backup",
    val botName: String = "",
    val healthcheckUrl: String = "",
    val maxMessageAgeS: String = "180",
    val resolveLinkedChats: Boolean = true,
    val debug: Boolean = false,
    // Anti-blocage Binance (src/antiban.js) : 10 codes faux d'affilée = 5 h de blocage
    val antibanMode: String = "stop",
    val antibanSelectiveAt: String = "8",
    val antibanStopAt: String = "9",
    val antibanStopResumeH: String = "0",
    // 🐦 X (Twitter) : notifications de l'appli X lues par le téléphone (src/xsource.js)
    val xEnabled: Boolean = false,
    val xAccounts: String = "",
    val xDryRun: Boolean = false,
    // 🧧 Binance Square : liens et réponses repérés sur Telegram (src/square.js)
    val squareEnabled: Boolean = true,
    val squareChannels: String = DEFAULT_SQUARE_CHANNELS,
) {
    /** Canaux, un par entrée (virgules ou retours à la ligne acceptés). */
    val channelList: List<String>
        get() = targetChannels.split(',', '\n', ';').map { it.trim() }.filter { it.isNotEmpty() }

    /** 🧧 Canaux de liens Binance Square, une entrée par canal. */
    val squareChannelList: List<String>
        get() = squareChannels.split(',', '\n', ';').map { it.trim() }.filter { it.isNotEmpty() }

    /** Comptes X, sans @, en minuscules. */
    val xAccountList: List<String>
        get() = xAccounts.split(',', '\n', ';', ' ').map { it.trim().removePrefix("@").lowercase() }
            .filter { it.isNotEmpty() }.distinct()

    val isComplete: Boolean get() = validate().isEmpty()

    /** Problèmes bloquants, en français, prêts à afficher. */
    fun validate(): List<String> = fieldErrors().map { it.second }

    /**
     * Problèmes bloquants, chacun avec son champ (clé de toJson) : l'écran
     * Réglages les affiche sous le bon champ.
     */
    fun fieldErrors(): List<Pair<String, String>> {
        val errors = mutableListOf<Pair<String, String>>()
        if (!apiId.trim().matches(Regex("\\d{3,12}"))) {
            errors += "apiId" to "API_ID : un nombre (my.telegram.org → API development tools)."
        }
        val hash = apiHash.trim()
        if (!hash.matches(Regex("[0-9a-fA-F]{32}"))) {
            errors += "apiHash" to "API_HASH : 32 caractères (chiffres et lettres a à f)."
        } else if (hash.lowercase() == EXAMPLE_API_HASH) {
            errors += "apiHash" to "API_HASH : c'est la valeur d'exemple, mets la tienne."
        }
        if (!phoneNumber.replace(" ", "").matches(Regex("\\+\\d{6,15}"))) {
            errors += "phoneNumber" to "Numéro : format international, par exemple +243812345678."
        }
        val channels = channelList
        if (channels.isEmpty()) {
            errors += "targetChannels" to "Canaux : au moins un (@pseudo, lien t.me ou ID -100…)."
        }
        for (channel in channels) {
            val bare = bareChannel(channel)
            if (!bare.matches(ID) && !bare.matches(USERNAME)) {
                errors += "targetChannels" to
                    "Canal « $channel » : mets @pseudo, un lien t.me/pseudo ou un ID numérique."
            }
        }
        if (botRole !in listOf("backup", "solo")) errors += "botRole" to "Rôle : « backup » ou « solo »."
        if (notifyLevel !in listOf("off", "problems", "all")) {
            errors += "notifyLevel" to "Alertes : off, problems ou all."
        }
        val token = alertBotToken.trim()
        if (token.isNotEmpty() && !token.matches(Regex("\\d{5,}:[A-Za-z0-9_-]{30,}"))) {
            errors += "alertBotToken" to "Jeton du bot d'alertes : format 123456789:ABC… (donné par @BotFather)."
        }
        val publish = bareChannel(publishChannel)
        if (publish.isNotEmpty() && !publish.matches(ID) && !publish.matches(USERNAME)) {
            errors += "publishChannel" to "Ton canal : mets @pseudo, un lien t.me/pseudo ou son ID -100…."
        }
        if (maxMessageAgeS.isNotBlank() && maxMessageAgeS.trim().toIntOrNull() == null) {
            errors += "maxMessageAgeS" to "Fraîcheur max : un nombre de secondes (180 conseillé)."
        }
        errors += antibanErrors()
        for (account in xAccountList) {
            if (!account.matches(X_HANDLE)) {
                errors += "xAccounts" to
                    "Compte X « $account » : un pseudo de 1 à 15 lettres, chiffres ou _ (ex. @binance)."
            }
        }
        for (channel in squareChannelList) {
            val bare = bareChannel(channel)
            if (!bare.matches(ID) && !bare.matches(USERNAME)) {
                errors += "squareChannels" to
                    "Canal « $channel » : mets @pseudo, un lien t.me/pseudo ou un ID numérique."
            }
        }
        return errors
    }

    /** Seuils de l'anti-blocage : le 10e code faux (blocage Binance) n'est jamais permis. */
    private fun antibanErrors(): List<Pair<String, String>> {
        val errors = mutableListOf<Pair<String, String>>()
        if (antibanMode !in listOf("stop", "light")) errors += "antibanMode" to "Anti-blocage : « stop » ou « light »."
        val selective = antibanSelectiveAt.trim().toIntOrNull()
        if (selective == null || selective !in 0..9) {
            errors += "antibanSelectiveAt" to "Anti-blocage : codes clairs à partir de 0 à 9 codes faux (0 = jamais)."
        }
        if (antibanMode == "stop") {
            val stop = antibanStopAt.trim().toIntOrNull()
            val min = maxOf(1, selective ?: 1)
            if (stop == null || stop !in min..9) {
                errors += "antibanStopAt" to
                    "Anti-blocage : arrêt entre $min et 9 codes faux (jamais 10 : c'est le blocage)."
            }
            val resume = antibanStopResumeH.trim().toIntOrNull()
            if (resume == null || resume !in 0..168) {
                errors += "antibanStopResumeH" to
                    "Anti-blocage : reprise automatique entre 0 et 168 h (0 = #reprendre)."
            }
        }
        return errors
    }

    /** Remarques non bloquantes (enregistrement possible). */
    fun warnings(): List<String> = channelList.mapNotNull { channel ->
        val bare = bareChannel(channel)
        if (bare.matches(ID) && bare.startsWith("-") && !bare.startsWith("-100")) {
            "Canal $channel : l'ID d'un canal commence par -100 (ex. -100${bare.removePrefix("-")}). " +
                "Laisse-le tel quel seulement si c'est un groupe."
        } else {
            null
        }
    } + listOfNotNull(
        if (xEnabled && xAccountList.isEmpty()) {
            "X : aucun compte choisi, toutes les notifications de l'appli X seront lues, suggestions " +
                "comprises. Une liste de comptes est conseillée."
        } else {
            null
        },
        if (xEnabled && xDryRun) "X : essai à blanc actif, aucun code X ne sera tapé sur Binance." else null,
        if (publishChannel.isNotBlank() && alertBotToken.isBlank()) {
            "Publication : il faut le jeton du bot d'alertes, c'est lui qui publie sur ton canal."
        } else {
            null
        },
    )

    /** Variables d'environnement pour le bot (Node.js). */
    fun toEnv(): Map<String, String> = buildMap {
        put("API_ID", apiId.trim())
        put("API_HASH", apiHash.trim())
        put("PHONE_NUMBER", phoneNumber.replace(" ", ""))
        // Forme comprise par le bot : @pseudo ou ID (un lien t.me/… sans https ne l'est pas)
        put("TARGET_CHANNELS", channelList.joinToString(",") { normalizedChannel(it) })
        put("NOTIFY_LEVEL", notifyLevel)
        put("ALERT_BOT_TOKEN", alertBotToken.trim())
        put("ALERT_CHAT_ID", alertChatId.trim())
        put("PUBLISH_CHANNEL", if (publishChannel.isBlank()) "" else normalizedChannel(publishChannel))
        put("BOT_ROLE", botRole)
        put("BOT_NAME", botName.trim().ifEmpty { "📱 Téléphone" })
        put("HEALTHCHECK_URL", healthcheckUrl.trim())
        put("MAX_MESSAGE_AGE_S", maxMessageAgeS.trim().ifEmpty { "180" })
        put("RESOLVE_LINKED_CHATS", resolveLinkedChats.toString())
        put("DEBUG", debug.toString())
        put("ANTIBAN_MODE", antibanMode)
        put("ANTIBAN_SELECTIVE_AT", antibanSelectiveAt.trim().ifEmpty { "8" })
        put("ANTIBAN_STOP_AT", antibanStopAt.trim().ifEmpty { "9" })
        put("ANTIBAN_STOP_RESUME_H", antibanStopResumeH.trim().ifEmpty { "0" })
        put("X_ENABLED", xEnabled.toString())
        put("X_ACCOUNTS", xAccountList.joinToString(","))
        put("X_DRY_RUN", xDryRun.toString())
        put("SQUARE_ENABLED", squareEnabled.toString())
        put("SQUARE_CHANNELS", squareChannelList.joinToString(",") { normalizedChannel(it) })
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("apiId", apiId)
        put("apiHash", apiHash)
        put("phoneNumber", phoneNumber)
        put("targetChannels", targetChannels)
        put("alertBotToken", alertBotToken)
        put("notifyLevel", notifyLevel)
        put("alertChatId", alertChatId)
        put("publishChannel", publishChannel)
        put("botRole", botRole)
        put("botName", botName)
        put("healthcheckUrl", healthcheckUrl)
        put("maxMessageAgeS", maxMessageAgeS)
        put("resolveLinkedChats", resolveLinkedChats)
        put("debug", debug)
        put("antibanMode", antibanMode)
        put("antibanSelectiveAt", antibanSelectiveAt)
        put("antibanStopAt", antibanStopAt)
        put("antibanStopResumeH", antibanStopResumeH)
        put("xEnabled", xEnabled)
        put("xAccounts", xAccounts)
        put("xDryRun", xDryRun)
        put("squareEnabled", squareEnabled)
        put("squareChannels", squareChannels)
    }

    fun save(file: File) = file.writeTextAtomic(toJson().toString(2))

    /** Reprend les valeurs d'un .env (PC) : le rôle et le nom restent ceux du téléphone. */
    fun mergeEnv(text: String): BotConfig {
        val env = parseEnv(text)
        fun pick(key: String, current: String) = env[key]?.takeIf { it.isNotBlank() } ?: current
        return copy(
            apiId = pick("API_ID", apiId),
            apiHash = pick("API_HASH", apiHash),
            phoneNumber = pick("PHONE_NUMBER", phoneNumber),
            targetChannels = env["TARGET_CHANNELS"]?.takeIf { it.isNotBlank() }
                ?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.joinToString(",\n")
                ?: targetChannels,
            alertBotToken = pick("ALERT_BOT_TOKEN", alertBotToken),
            notifyLevel = pick("NOTIFY_LEVEL", notifyLevel).lowercase(),
            alertChatId = pick("ALERT_CHAT_ID", alertChatId),
            publishChannel = pick("PUBLISH_CHANNEL", publishChannel),
            healthcheckUrl = pick("HEALTHCHECK_URL", healthcheckUrl),
            maxMessageAgeS = pick("MAX_MESSAGE_AGE_S", maxMessageAgeS),
            resolveLinkedChats = env["RESOLVE_LINKED_CHATS"]?.let { it.trim().lowercase() != "false" }
                ?: resolveLinkedChats,
            debug = env["DEBUG"]?.let { it.trim().lowercase() == "true" } ?: debug,
            antibanMode = pick("ANTIBAN_MODE", antibanMode).trim().lowercase(),
            antibanSelectiveAt = pick("ANTIBAN_SELECTIVE_AT", antibanSelectiveAt),
            antibanStopAt = pick("ANTIBAN_STOP_AT", antibanStopAt),
            antibanStopResumeH = pick("ANTIBAN_STOP_RESUME_H", antibanStopResumeH),
            xEnabled = env["X_ENABLED"]?.let { it.trim().lowercase() == "true" } ?: xEnabled,
            xAccounts = env["X_ACCOUNTS"]?.takeIf { it.isNotBlank() }
                ?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.joinToString(", ")
                ?: xAccounts,
            xDryRun = env["X_DRY_RUN"]?.let { it.trim().lowercase() == "true" } ?: xDryRun,
            squareEnabled = env["SQUARE_ENABLED"]?.let { it.trim().lowercase() != "false" } ?: squareEnabled,
            squareChannels = env["SQUARE_CHANNELS"]?.takeIf { it.isNotBlank() }
                ?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.joinToString(",\n")
                ?: squareChannels,
        )
    }

    companion object {
        /** Le canal qui publie ces liens : réglage de départ, modifiable. */
        const val DEFAULT_SQUARE_CHANNELS = "@Packet_Red"
        private const val EXAMPLE_API_HASH = "abcdef1234567890abcdef1234567890"
        private val ID = Regex("-?\\d+")
        private val USERNAME = Regex("[A-Za-z][A-Za-z0-9_]{3,31}")
        private val X_HANDLE = Regex("[a-z0-9_]{1,15}")

        /** « https://t.me/nom/ », « t.me/nom », « @nom » → « nom » ; un ID reste tel quel. */
        fun bareChannel(raw: String): String = raw.trim()
            .replace(Regex("^https?://", RegexOption.IGNORE_CASE), "")
            .replace(Regex("^(www\\.)?(t\\.me|telegram\\.me)/", RegexOption.IGNORE_CASE), "")
            .removePrefix("@")
            .trimEnd('/')

        fun normalizedChannel(raw: String): String {
            val bare = bareChannel(raw)
            return if (bare.matches(ID)) bare else "@$bare"
        }

        fun load(file: File): BotConfig = try {
            fromJson(JSONObject(file.readText()))
        } catch (_: Exception) {
            BotConfig()
        }

        fun fromJson(o: JSONObject) = BotConfig(
            apiId = o.optString("apiId"),
            apiHash = o.optString("apiHash"),
            phoneNumber = o.optString("phoneNumber"),
            targetChannels = o.optString("targetChannels"),
            alertBotToken = o.optString("alertBotToken"),
            notifyLevel = o.optString("notifyLevel", "all"),
            alertChatId = o.optString("alertChatId"),
            publishChannel = o.optString("publishChannel"),
            botRole = o.optString("botRole", "backup"),
            botName = o.optString("botName"),
            healthcheckUrl = o.optString("healthcheckUrl"),
            maxMessageAgeS = o.optString("maxMessageAgeS", "180"),
            resolveLinkedChats = o.optBoolean("resolveLinkedChats", true),
            debug = o.optBoolean("debug", false),
            antibanMode = o.optString("antibanMode", "stop"),
            antibanSelectiveAt = o.optString("antibanSelectiveAt", "8"),
            antibanStopAt = o.optString("antibanStopAt", "9"),
            antibanStopResumeH = o.optString("antibanStopResumeH", "0"),
            xEnabled = o.optBoolean("xEnabled", false),
            xAccounts = o.optString("xAccounts"),
            xDryRun = o.optBoolean("xDryRun", false),
            squareEnabled = o.optBoolean("squareEnabled", true),
            squareChannels = o.optString("squareChannels", DEFAULT_SQUARE_CHANNELS),
        )

        /** Lecture d'un fichier .env : CLÉ=valeur, commentaires #, guillemets. */
        fun parseEnv(text: String): Map<String, String> {
            val result = linkedMapOf<String, String>()
            for (rawLine in text.lines()) {
                var line = rawLine.trim().removePrefix("﻿")
                if (line.isEmpty() || line.startsWith("#")) continue
                if (line.startsWith("export ")) line = line.removePrefix("export ").trim()
                val equals = line.indexOf('=')
                if (equals <= 0) continue
                val key = line.substring(0, equals).trim()
                var value = line.substring(equals + 1).trim()
                value = if (value.startsWith('"') || value.startsWith('\'')) {
                    // Valeur entre guillemets, éventuellement suivie d'un « # commentaire »
                    val end = value.indexOf(value[0], 1)
                    if (end > 0) value.substring(1, end) else value.substring(1)
                } else {
                    value.replace(Regex("\\s+#.*$"), "")
                }
                if (key.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) result[key] = value
            }
            return result
        }
    }
}
