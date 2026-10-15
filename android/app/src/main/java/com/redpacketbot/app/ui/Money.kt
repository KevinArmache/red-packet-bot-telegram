package com.redpacketbot.app.ui

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * 💱 Devise d'affichage des gains (Réglages → Devise) : dollar, franc
 * congolais, ou les deux. Les gains sont enregistrés en dollars par le bot
 * (prix public Binance) ; les francs viennent du taux du jour, ou de ton taux
 * à toi s'il est rempli. Choix propre à l'app : le bot n'est pas redémarré.
 */
data class MoneyPrefs(
    /** usd, cdf ou both */
    val mode: String = USD,
    /** Taux que tu as saisi (FC pour 1 $), prioritaire sur le taux du jour. */
    val manualRate: Double? = null,
    /** Taux du jour (open.er-api.com) et son heure de lecture. */
    val autoRate: Double? = null,
    val autoRateAt: Long = 0L,
) {
    /** Francs congolais pour 1 dollar, ou null si aucun taux n'est connu. */
    val cdfRate: Double? get() = manualRate ?: autoRate

    val wantsCdf: Boolean get() = mode != USD

    /** Montant principal : « 0,30 $ » ou « 693 FC » (dollars s'il manque le taux). */
    fun primary(usd: Double): String {
        val rate = cdfRate
        return if (mode == CDF && rate != null) Format.cdf(usd * rate) else Format.usd(usd)
    }

    /** Deuxième devise, seulement en mode « les deux » : « 693 FC ». */
    fun secondary(usd: Double): String? {
        val rate = cdfRate ?: return null
        return if (mode == BOTH) Format.cdf(usd * rate) else null
    }

    companion object {
        const val USD = "usd"
        const val CDF = "cdf"
        const val BOTH = "both"
    }
}

/** Devise choisie, disponible dans tous les écrans (fournie par AppRoot). */
val LocalMoney = staticCompositionLocalOf { MoneyPrefs() }
