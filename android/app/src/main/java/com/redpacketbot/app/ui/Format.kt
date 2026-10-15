package com.redpacketbot.app.ui

import java.util.Locale
import kotlin.math.abs

/** Formats d'affichage en français. */
object Format {
    /** « à l'instant », « il y a 42 s », « il y a 3 min », « il y a 2 h », « il y a 3 j ». */
    fun ago(at: Long, now: Long = System.currentTimeMillis()): String {
        if (at <= 0) return "jamais"
        val seconds = ((now - at) / 1000).coerceAtLeast(0)
        return when {
            seconds < 5 -> "à l'instant"
            seconds < 90 -> "il y a $seconds s"
            seconds < 5400 -> "il y a ${seconds / 60} min"
            seconds < 2 * 86_400 -> "il y a ${seconds / 3600} h"
            else -> "il y a ${seconds / 86_400} j"
        }
    }

    /** Durée courte : « 42 s », « 12 min », « 3 h 05 », « 2 j 4 h ». */
    fun duration(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        return when {
            s < 60 -> "$s s"
            s < 3600 -> "${s / 60} min"
            s < 86_400 -> "${s / 3600} h ${"%02d".format((s % 3600) / 60)}"
            else -> "${s / 86_400} j ${(s % 86_400) / 3600} h"
        }
    }

    /** Latence : « 820 ms », « 1,4 s ». */
    fun latency(ms: Long?): String = when {
        ms == null || ms <= 0 -> "—"
        ms < 1000 -> "$ms ms"
        else -> String.format(Locale.FRANCE, "%.1f s", ms / 1000.0)
    }

    /** Montant d'une crypto : « 0,0009 », « 12,5 », « 1 250 ». */
    fun amount(value: Double): String {
        val a = abs(value)
        val digits = when {
            a == 0.0 -> 0
            a >= 100 -> 0
            a >= 1 -> 2
            a >= 0.01 -> 4
            else -> 8
        }
        val text = String.format(Locale.FRANCE, "%,.${digits}f", value)
        return if (digits > 0) text.trimEnd('0').trimEnd(',') else text
    }

    /** Dollars : « 0,30 $ », « < 0,01 $ ». */
    fun usd(value: Double): String = when {
        value <= 0.0 -> "0 $"
        value < 0.01 -> "< 0,01 $"
        else -> String.format(Locale.FRANCE, "%,.2f $", value)
    }
}
