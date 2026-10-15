package com.redpacketbot.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.Heartbeat
import com.redpacketbot.app.ui.Format
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing

/** Au-delà, l'autre appareil est jugé silencieux (même seuil que src/relay.js). */
private const val PEER_TIMEOUT_MS = 150_000L

/**
 * Relais PC ⇄ téléphone : les deux appareils, celui qui réclame en or, et le
 * lien entre eux (des points qui filent vers l'appareil responsable).
 */
@Composable
fun RelayCard(heartbeat: Heartbeat?, running: Boolean, modifier: Modifier = Modifier) {
    val now = System.currentTimeMillis()
    val peerSilent = heartbeat == null || heartbeat.peerAt <= 0 || now - heartbeat.peerAt > PEER_TIMEOUT_MS
    val mode = heartbeat?.mode.orEmpty()
    val phoneClaims = running && mode == "active"
    val pcClaims = running && mode == "standby"

    val pcState = when {
        heartbeat == null || !running -> "❔ inconnu"
        heartbeat.peerState.isEmpty() -> "❔ pas encore vu"
        peerSilent -> "📴 silencieux"
        else -> when (heartbeat.peerState) {
            "active" -> "🟢 prêt"
            "pause" -> "🛑 pause anti-ban"
            "stopped" -> "⏹️ arrêté"
            "unavailable" -> "🟠 pas prêt"
            else -> heartbeat.peerState
        }
    }
    val phoneState = when {
        !running -> "⏹️ arrêté"
        mode == "active" -> "🟢 prêt"
        mode == "standby" -> "😴 en veille"
        mode == "checking" -> "🔎 vérifie"
        else -> "⏳"
    }
    val sentence = when {
        !running -> "Démarre le bot pour voir qui réclame les codes."
        pcClaims -> "Le PC réclame les codes, le téléphone attend en secours."
        phoneClaims && peerSilent && heartbeat?.peerAt != 0L ->
            "Le PC ne répond plus (${Format.ago(heartbeat?.peerAt ?: 0)}) : le téléphone réclame."
        phoneClaims -> "Le téléphone réclame les codes (PC absent ou pas prêt)."
        else -> "Vérification de l'état du PC…"
    }

    SectionCard(modifier, title = "🤝 Relais PC ⇄ téléphone") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DeviceTile("💻", "PC", pcState, claims = pcClaims, Modifier.weight(1f))
            Link(
                towardsPc = pcClaims,
                active = running && (pcClaims || phoneClaims),
                broken = running && peerSilent && heartbeat?.peerAt != 0L,
                modifier = Modifier.width(56.dp).height(28.dp),
            )
            DeviceTile("📱", "Téléphone", phoneState, claims = phoneClaims, Modifier.weight(1f))
        }
        Text(sentence, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (running && heartbeat != null && heartbeat.peerAt > 0 && !peerSilent) {
            Hint("Dernier signal du PC : ${Format.ago(heartbeat.peerAt)}")
        }
    }
}

@Composable
private fun DeviceTile(emoji: String, name: String, state: String, claims: Boolean, modifier: Modifier) {
    val gold = AppColors.gold
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = if (claims) gold.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(if (claims) 1.5.dp else 1.dp, if (claims) gold else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            Modifier.padding(vertical = Spacing.m, horizontal = Spacing.s),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(emoji, fontSize = 26.sp)
            Text(name, style = MaterialTheme.typography.titleSmall)
            Text(state, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            if (claims) Text("🎯 réclame", style = MaterialTheme.typography.labelMedium, color = gold)
        }
    }
}

/** Lien animé : des points vont vers l'appareil qui réclame ; ✂️ si le PC est silencieux. */
@Composable
private fun Link(towardsPc: Boolean, active: Boolean, broken: Boolean, modifier: Modifier) {
    val color = when {
        broken -> AppColors.danger
        active -> AppColors.gold
        else -> MaterialTheme.colorScheme.outline
    }
    val transition = rememberInfiniteTransition(label = "link")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val y = size.height / 2
            drawLine(
                color = color.copy(alpha = 0.45f),
                start = Offset(4.dp.toPx(), y),
                end = Offset(size.width - 4.dp.toPx(), y),
                strokeWidth = 2.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)),
            )
            if (active && !broken) {
                for (i in 0..2) {
                    val p = (phase + i / 3f) % 1f
                    val x = if (towardsPc) size.width * (1f - p) else size.width * p
                    drawCircle(color = color.copy(alpha = 1f - p * 0.6f), radius = 3.dp.toPx(), center = Offset(x, y))
                }
            }
        }
        if (broken) Text("✂️", fontSize = 14.sp, color = Color.Unspecified)
    }
}
