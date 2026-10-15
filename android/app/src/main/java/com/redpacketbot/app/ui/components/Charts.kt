package com.redpacketbot.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.HourSlot
import com.redpacketbot.app.Status
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing

/** Codes par heure sur 24 h : barre = détectés, partie dorée = gagnés. */
@Composable
fun HourBars(slots: List<HourSlot>, modifier: Modifier = Modifier) {
    val detected = slots.sumOf { it.detected }
    val won = slots.sumOf { it.won }
    val max = (slots.maxOfOrNull { it.detected } ?: 0).coerceAtLeast(1)
    val base = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
    val gold = AppColors.gold
    val track = MaterialTheme.colorScheme.surfaceContainerHighest
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(72.dp)
                .semantics { contentDescription = "$detected codes détectés et $won gagnés sur 24 heures" },
        ) {
            val gap = 3.dp.toPx()
            val w = (size.width - gap * (slots.size - 1)) / slots.size
            val radius = CornerRadius(3.dp.toPx())
            slots.forEachIndexed { i, slot ->
                val x = i * (w + gap)
                // Repère discret de chaque heure (même vide)
                drawRoundRect(track, Offset(x, size.height - 3.dp.toPx()), Size(w, 3.dp.toPx()), radius)
                if (slot.detected > 0) {
                    val h = (size.height * slot.detected / max).coerceAtLeast(4.dp.toPx())
                    drawRoundRect(base, Offset(x, size.height - h), Size(w, h), radius)
                    if (slot.won > 0) {
                        val hw = (size.height * slot.won / max).coerceAtLeast(4.dp.toPx())
                        drawRoundRect(gold, Offset(x, size.height - hw), Size(w, hw), radius)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Hint("−24 h")
            Hint("−12 h")
            Hint("maintenant")
        }
    }
}

/**
 * Jauge anti-blocage : 10 cases = 10 codes faux d'affilée (Binance bloque au
 * 10e). Or sous le seuil « codes clairs », orange jusqu'à l'arrêt, rouge
 * au-delà ; la 10e case 🔒 n'est jamais atteinte en mode « stop ».
 */
@Composable
fun AntibanGauge(fails: Int, selectiveAt: Int, stopAt: Int, modifier: Modifier = Modifier) {
    val gold = AppColors.gold
    val warning = AppColors.warning
    val danger = AppColors.danger
    val empty = MaterialTheme.colorScheme.surfaceContainerHighest
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        Row(
            Modifier.fillMaxWidth().semantics { contentDescription = "$fails codes faux d'affilée sur 10" },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (n in 1..10) {
                val zone = when {
                    stopAt in 1..n -> danger
                    selectiveAt in 1..n -> warning
                    else -> gold
                }
                val filled = n <= fails
                val alpha by animateFloatAsState(if (filled) 1f else 0f, label = "seg$n")
                Box(
                    Modifier
                        .weight(1f)
                        .height(18.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(empty)
                        .then(
                            if (n == 10) Modifier.border(BorderStroke(1.dp, danger.copy(alpha = 0.7f)), RoundedCornerShape(5.dp))
                            else Modifier,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(Modifier.matchParentSize().background(zone.copy(alpha = alpha)))
                    if (n == 10) Text("🔒", fontSize = 10.sp)
                }
            }
        }
        val parts = buildList {
            if (selectiveAt > 0) add("🟠 codes clairs dès $selectiveAt")
            if (stopAt > 0) add("⛔ arrêt à $stopAt")
            add("🔒 blocage Binance à 10")
        }
        Hint(parts.joinToString(" · "))
    }
}

/** Bandeau d'état de l'anti-blocage (titre de la carte). */
@Composable
fun antibanLevel(level: String, pauseUntil: Long): Pair<String, androidx.compose.ui.graphics.Color> = when {
    pauseUntil > System.currentTimeMillis() -> "🛑 Blocage jusqu'à ${Status.time(pauseUntil)}" to AppColors.danger
    level == "halt" -> "⛔ Arrêt (#reprendre)" to AppColors.danger
    level == "lock" -> "🛑 Blocage Binance" to AppColors.danger
    level == "selective" -> "🟠 Codes clairs seulement" to AppColors.warning
    else -> "🛡️ Normal" to AppColors.success
}
