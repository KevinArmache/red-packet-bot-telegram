package com.redpacketbot.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Réponse donnée pour un quiz, et les canaux qui la donnent. */
data class SquareAnswer(val text: String, val from: List<String>)

/** Un Red Packet de Binance Square repéré sur Telegram (bot-data/.run/square.json, écrit par src/square.js). */
data class SquareEntry(
    val id: String,
    /** quiz, direct (pas de question) ou vide (le canal n'a rien précisé) */
    val type: String,
    val coin: String,
    /** Montant annoncé par le canal, souvent vide */
    val amount: String,
    val answers: List<SquareAnswer>,
    val sources: List<String>,
    val link: String,
    val firstAt: Long,
    val publishedAt: Long,
) {
    val answer: String get() = answers.firstOrNull()?.text.orEmpty()
}

/** Ce que tu as fait d'un Red Packet (bot-data/.run/square-marks.json, écrit par l'app seule). */
data class SquareMark(val mark: String, val at: Long)

data class SquareLog(
    val items: List<SquareEntry> = emptyList(),
    val marks: Map<String, SquareMark> = emptyMap(),
    /** Dates des fichiers : relus seulement quand elles changent. */
    val stamp: Long = 0L,
    val marksStamp: Long = 0L,
) {
    /** TAKE, OPENED, WON ou DONE : la liste de l'onglet où ce Red Packet se trouve. */
    fun listOf(entry: SquareEntry, now: Long = System.currentTimeMillis()): String = when (marks[entry.id]?.mark) {
        MARK_OPENED -> OPENED
        MARK_WON -> WON
        MARK_MISSED, MARK_HIDDEN -> DONE
        else -> if (now - entry.firstAt < TAKE_WINDOW_MS) TAKE else DONE
    }

    fun inList(list: String, now: Long = System.currentTimeMillis()) = items.filter { listOf(it, now) == list }

    companion object {
        const val TAKE = "take"
        const val OPENED = "opened"
        const val WON = "won"
        const val DONE = "done"

        const val MARK_OPENED = "opened"
        const val MARK_WON = "won"
        const val MARK_MISSED = "missed"
        const val MARK_HIDDEN = "hidden"

        /** Le statut réel n'est pas lu sur Binance : sans nouvelle, un Red Packet sort de « À prendre ». Même valeur dans src/square.js. */
        private const val TAKE_WINDOW_MS = 24 * 3_600_000L

        fun read(file: File, marksFile: File, previous: SquareLog? = null): SquareLog {
            val stamp = file.lastModified()
            val marksStamp = marksFile.lastModified()
            if (previous != null && previous.stamp == stamp && previous.marksStamp == marksStamp) return previous
            val items = if (previous != null && previous.stamp == stamp) {
                previous.items
            } else {
                try {
                    parseItems(JSONObject(file.readText()))
                } catch (_: Exception) {
                    previous?.items.orEmpty()
                }
            }
            return SquareLog(items, readMarks(marksFile), stamp, marksStamp)
        }

        private fun parseItems(o: JSONObject): List<SquareEntry> {
            val array = o.optJSONArray("items") ?: return emptyList()
            return (0 until array.length()).mapNotNull { i ->
                val e = array.optJSONObject(i) ?: return@mapNotNull null
                val id = e.optString("id")
                if (id.isEmpty()) return@mapNotNull null
                SquareEntry(
                    id = id,
                    type = e.optString("type"),
                    coin = e.optString("coin"),
                    amount = e.optString("amount"),
                    answers = e.optJSONArray("answers")?.let { answers ->
                        (0 until answers.length()).mapNotNull { n ->
                            answers.optJSONObject(n)?.let { SquareAnswer(it.optString("text"), strings(it.optJSONArray("from"))) }
                        }
                    }.orEmpty(),
                    sources = strings(e.optJSONArray("sources")),
                    link = "https://app.binance.com/uni-qr/${e.optString("segment", "cpos")}/$id" +
                        "?uc=app_square_share_link&us=copylink",
                    firstAt = e.optLong("firstAt"),
                    publishedAt = e.optLong("publishedAt"),
                )
            }
        }

        private fun strings(array: JSONArray?): List<String> =
            array?.let { list -> (0 until list.length()).map { list.optString(it) } }.orEmpty()

        private fun readMarks(file: File): Map<String, SquareMark> = try {
            val o = JSONObject(file.readText())
            o.keys().asSequence().mapNotNull { id ->
                o.optJSONObject(id)?.let { id to SquareMark(it.optString("mark"), it.optLong("at")) }
            }.toMap()
        } catch (_: Exception) {
            emptyMap()
        }

        /** Marque un Red Packet (écriture atomique ; relu par le bot). Le plus ancien part au-delà de 500. */
        fun writeMark(file: File, id: String, mark: String) {
            val marks = readMarks(file).toMutableMap()
            marks[id] = SquareMark(mark, System.currentTimeMillis())
            val kept = marks.entries.sortedByDescending { it.value.at }.take(500)
            val o = JSONObject()
            for ((key, value) in kept) o.put(key, JSONObject().put("mark", value.mark).put("at", value.at))
            file.writeTextAtomic(o.toString())
        }
    }
}
