package com.redpacketbot.app

import org.json.JSONObject
import java.io.File

/** Un code et son issue (bot-data/.run/activity.json, écrit par src/activity.js). */
data class ClaimEntry(
    val code: String,
    /** telegram ou x */
    val origin: String,
    val channel: String,
    /** monospace, lien, label ou texte */
    val source: String,
    /** won, failed, guarded, deferred, skipped, unknown, paused, error, dry */
    val status: String,
    val gain: String,
    val gainUsd: Double?,
    val at: Long,
    val latencyMs: Long?,
)

/** Activité d'un canal Telegram ou d'un compte X. */
data class SourceStats(
    val name: String,
    val origin: String,
    val detected: Int,
    val won: Int,
    val lastMsgAt: Long,
    val lastCodeAt: Long,
)

/** Codes détectés / gagnés pendant une heure (graphique 24 h). */
data class HourSlot(val start: Long, val detected: Int, val won: Int)

data class ActivityLog(
    val since: Long = 0L,
    val items: List<ClaimEntry> = emptyList(),
    val hours: List<HourSlot> = emptyList(),
    /** crypto → montant gagné aujourd'hui */
    val gainsToday: Map<String, Double> = emptyMap(),
    val gainsTotal: Map<String, Double> = emptyMap(),
    val gainsTodayUsd: Double = 0.0,
    val gainsTotalUsd: Double = 0.0,
    val sources: List<SourceStats> = emptyList(),
    /** Date du fichier : relu seulement quand elle change. */
    val stamp: Long = 0L,
) {
    /** Les 24 dernières heures, de la plus ancienne à l'heure en cours (heures vides comprises). */
    fun last24h(now: Long = System.currentTimeMillis()): List<HourSlot> {
        val current = now / HOUR * HOUR
        val byStart = hours.associateBy { it.start }
        return (23 downTo 0).map { back ->
            val start = current - back * HOUR
            byStart[start] ?: HourSlot(start, 0, 0)
        }
    }

    companion object {
        private const val HOUR = 3_600_000L

        fun read(file: File, previous: ActivityLog? = null): ActivityLog {
            val stamp = file.lastModified()
            if (stamp == 0L) return ActivityLog()
            if (previous != null && previous.stamp == stamp) return previous
            return try {
                parse(JSONObject(file.readText()), stamp)
            } catch (_: Exception) {
                previous ?: ActivityLog()
            }
        }

        private fun parse(o: JSONObject, stamp: Long): ActivityLog {
            val items = o.optJSONArray("items")?.let { array ->
                (0 until array.length()).mapNotNull { i ->
                    val e = array.optJSONObject(i) ?: return@mapNotNull null
                    ClaimEntry(
                        code = e.optString("code"),
                        origin = e.optString("origin", "telegram"),
                        channel = e.optString("channel"),
                        source = e.optString("source"),
                        status = e.optString("status"),
                        gain = e.optString("gain"),
                        gainUsd = if (e.isNull("gainUsd")) null else e.optDouble("gainUsd").takeIf { !it.isNaN() },
                        at = e.optLong("at"),
                        latencyMs = if (e.isNull("latencyMs")) null else e.optLong("latencyMs"),
                    )
                }
            }.orEmpty()
            val hours = o.optJSONObject("hours")?.let { obj ->
                obj.keys().asSequence().mapNotNull { key ->
                    val slot = obj.optJSONObject(key) ?: return@mapNotNull null
                    key.toLongOrNull()?.let { HourSlot(it, slot.optInt("d"), slot.optInt("w")) }
                }.toList()
            }.orEmpty()
            val gains = o.optJSONObject("gains") ?: JSONObject()
            val sources = o.optJSONObject("sources")?.let { obj ->
                obj.keys().asSequence().mapNotNull { name ->
                    val s = obj.optJSONObject(name) ?: return@mapNotNull null
                    SourceStats(
                        name = name,
                        origin = s.optString("origin", "telegram"),
                        detected = s.optInt("detected"),
                        won = s.optInt("won"),
                        lastMsgAt = s.optLong("lastMsgAt"),
                        lastCodeAt = s.optLong("lastCodeAt"),
                    )
                }.toList()
            }.orEmpty()
            val today = gains.optString("day") == java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT)
                .format(java.util.Date())
            return ActivityLog(
                since = o.optLong("since"),
                items = items,
                hours = hours,
                gainsToday = if (today) amounts(gains.optJSONObject("today")) else emptyMap(),
                gainsTotal = amounts(gains.optJSONObject("total")),
                gainsTodayUsd = if (today) gains.optDouble("todayUsd", 0.0) else 0.0,
                gainsTotalUsd = gains.optDouble("totalUsd", 0.0),
                sources = sources,
                stamp = stamp,
            )
        }

        private fun amounts(o: JSONObject?): Map<String, Double> =
            o?.keys()?.asSequence()?.associateWith { o.optDouble(it, 0.0) }?.filterValues { it > 0 }.orEmpty()
    }
}

/** État de la lecture des notifications X (run/x-listener.json, XNotificationListener). */
data class XListenerState(
    val connected: Boolean = false,
    val posts: Int = 0,
    val dropped: Int = 0,
    val lastPostAt: Long = 0L,
    val lastFrom: String = "",
    val lastExcerpt: String = "",
) {
    companion object {
        fun read(file: File): XListenerState = try {
            val o = JSONObject(file.readText())
            XListenerState(
                connected = o.optBoolean("connected"),
                posts = o.optInt("posts"),
                dropped = o.optInt("dropped"),
                lastPostAt = o.optLong("lastPostAt"),
                lastFrom = o.optString("lastFrom"),
                lastExcerpt = o.optString("lastExcerpt"),
            )
        } catch (_: Exception) {
            XListenerState()
        }
    }
}
