package com.redpacketbot.app.ui

import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.roundToLong

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

    /**
     * Montant d'une crypto, toujours court : « 1 250 », « 12,5 », « 0,0009 »,
     * et pour les tout petits montants « 0,0₆12 » (= 0,00000012 : le petit
     * chiffre compte les zéros, comme dans les applis crypto).
     */
    fun amount(value: Double): String {
        val a = abs(value)
        return when {
            a == 0.0 || a.isNaN() -> "0"
            a >= 100 -> String.format(Locale.FRANCE, "%,.0f", value)
            a >= 1 -> trimmed(String.format(Locale.FRANCE, "%,.2f", value))
            a >= TINY -> significant(value)
            else -> tiny(value)
        }
    }

    /**
     * Dollars, toujours courts : « 12,40 $ », « 0,30 $ », « 0,0042 $ », et
     * « 0,0₇8 $ » pour un Red Packet minuscule (= 0,00000008 $).
     */
    fun usd(value: Double): String = money(value, "$")

    /** Francs congolais : « 2 311 FC », « 54,30 FC », « 0,021 FC ». */
    fun cdf(value: Double): String = money(value, "FC")

    /** Somme d'argent courte : entiers au-delà de 100, 2 décimales, puis petits montants. */
    private fun money(value: Double, unit: String): String {
        if (value <= 0.0 || value.isNaN()) return "0 $unit"
        val text = when {
            value >= 100 -> String.format(Locale.FRANCE, "%,.0f", value)
            value >= 0.01 -> String.format(Locale.FRANCE, "%,.2f", value)
            value >= TINY -> significant(value)
            else -> tiny(value)
        }
        return "$text $unit"
    }

    /** Gain tel que Binance l'écrit (« 0.00000012 SPELL ») → « 0,0₆12 SPELL ». */
    fun gain(raw: String): String {
        val m = Regex("([0-9]+(?:[.,][0-9]+)?)\\s*([A-Z][A-Z0-9]{1,9})").find(raw) ?: return raw
        val value = m.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return raw
        return "${amount(value)} ${m.groupValues[2]}"
    }

    /** En dessous, les zéros sont comptés en indice (0,0₄12). */
    private const val TINY = 0.0001
    private const val SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉"

    private fun trimmed(text: String) = text.trimEnd('0').trimEnd(',')

    /** Deux chiffres significatifs : 0,0042 · 0,012 · 0,5. */
    private fun significant(value: Double): String {
        val decimals = (ceil(-log10(abs(value))).toInt() + 1).coerceIn(1, 6)
        return trimmed(String.format(Locale.FRANCE, "%.${decimals}f", value))
    }

    /** 0,00000012 → « 0,0₆12 » : 0, virgule, 6 zéros, puis les chiffres utiles. */
    private fun tiny(value: Double): String {
        val a = abs(value)
        val exponent = floor(log10(a)).toInt() // 1,2e-7 → -7
        var zeros = -exponent - 1
        var digits = (a / 10.0.pow(exponent - 1)).roundToLong() // 2 chiffres : 12
        if (digits >= 100) { // arrondi 9,96 → 10,0 : un zéro de moins
            digits /= 10
            zeros -= 1
        }
        val count = zeros.toString().map { SUBSCRIPT[it - '0'] }.joinToString("")
        val sign = if (value < 0) "-" else ""
        return "${sign}0,0$count${digits.toString().trimEnd('0').ifEmpty { "0" }}"
    }
}
