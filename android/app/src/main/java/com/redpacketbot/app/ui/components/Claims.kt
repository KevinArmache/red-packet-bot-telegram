package com.redpacketbot.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.redpacketbot.app.ClaimEntry
import com.redpacketbot.app.ui.Format
import com.redpacketbot.app.ui.LocalMoney
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.MonoStyle
import com.redpacketbot.app.ui.theme.Spacing

/** Libellé et couleur de l'issue d'un code. */
@Composable
fun claimStatus(status: String): Pair<String, Color> = when (status) {
    "won" -> "🏆 Gagné" to AppColors.success
    "failed" -> "❌ Refusé" to AppColors.danger
    "guarded" -> "🛡️ Sauté" to AppColors.warning
    "deferred" -> "🤝 Autre appareil" to AppColors.info
    "skipped" -> "⏭️ Non tenté" to AppColors.idle
    "unknown" -> "❔ Inconnu" to AppColors.warning
    "paused" -> "🛑 Pause Binance" to AppColors.danger
    "error" -> "💥 Échec technique" to AppColors.danger
    "dry" -> "🧪 Essai à blanc" to AppColors.info
    else -> status to AppColors.idle
}

/** ✈️ TG ou 🐦 X. */
@Composable
fun OriginBadge(origin: String) {
    if (origin == "x") Pill("🐦 X", MaterialTheme.colorScheme.onSurface)
    else Pill("✈️ TG", AppColors.info)
}

private fun sourceLabel(source: String) = when (source) {
    "monospace" -> "monospace"
    "lien" -> "lien Cryptobox"
    "label" -> "« Code : »"
    "texte" -> "texte libre"
    else -> ""
}

/** Une ligne de l'historique : code, origine, canal, résultat, gain, latence. */
@Composable
fun ClaimRow(entry: ClaimEntry, modifier: Modifier = Modifier) {
    val (label, color) = claimStatus(entry.status)
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(entry.code, style = MonoStyle, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.width(Spacing.s))
                OriginBadge(entry.origin)
            }
            Text(
                listOf(entry.channel, sourceLabel(entry.source), Format.ago(entry.at))
                    .filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(Spacing.s))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Pill(label, color)
            val extra = when {
                entry.status == "won" && entry.gain.isNotBlank() -> "+" + Format.gain(entry.gain)
                entry.latencyMs != null -> "⚡ " + Format.latency(entry.latencyMs)
                else -> null
            }
            extra?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (entry.status == "won") AppColors.gold else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            // Valeur du gain dans la devise choisie (💱 Réglages) : $, FC ou les deux
            if (entry.status == "won") {
                val money = LocalMoney.current
                Text(
                    entry.gainUsd?.let { "≈ ${money.primary(it)}" } ?: "≈ …",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (entry.gainUsd != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                entry.gainUsd?.let { money.secondary(it) }?.let {
                    Text(
                        "≈ $it",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}
