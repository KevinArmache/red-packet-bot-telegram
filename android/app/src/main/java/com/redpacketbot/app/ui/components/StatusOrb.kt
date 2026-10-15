package com.redpacketbot.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.BotStatus
import com.redpacketbot.app.Tone
import com.redpacketbot.app.ui.theme.AppColors

/**
 * Bouton d'état de l'accueil : un anneau qui pulse selon l'état du bot
 * (vert actif, bleu en veille, or pendant un démarrage, gris arrêté, rouge
 * en cas de problème). Un appui démarre ou arrête, un appui long redémarre.
 */
@Composable
fun StatusOrb(
    status: BotStatus,
    onTap: () -> Unit,
    onLongPress: (() -> Unit)?,
    modifier: Modifier = Modifier,
    description: String = status.title,
) {
    val color by animateColorAsState(AppColors.of(status.tone), label = "orbColor")
    val busy = status.tone == Tone.BUSY
    val alive = status.tone == Tone.OK || status.tone == Tone.INFO || busy
    val transition = rememberInfiniteTransition(label = "orb")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(if (status.tone == Tone.OK) 2200 else 3200, easing = LinearOutSlowInEasing),
            RepeatMode.Restart,
        ),
        label = "pulse",
    )
    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing)),
        label = "spin",
    )
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (pressed) 0.93f else 1f, label = "press")
    val haptic = LocalHapticFeedback.current
    val tap by rememberUpdatedState(onTap)
    val longPress by rememberUpdatedState(onLongPress)
    val disc = MaterialTheme.colorScheme.surfaceContainerHigh

    Box(
        modifier
            .size(200.dp)
            .semantics {
                role = Role.Button
                contentDescription = description
            }
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        tryAwaitRelease()
                        pressed = false
                    },
                    onTap = { tap() },
                    onLongPress = {
                        longPress?.let {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            it()
                        }
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) {
            val r = size.minDimension / 2
            val ring = r * 0.6f
            // Ondes qui s'éloignent : le bot vit
            if (alive) {
                for (i in 0..1) {
                    val p = (pulse + i * 0.5f) % 1f
                    drawCircle(
                        color = color.copy(alpha = (1f - p) * 0.4f),
                        radius = ring + (r - ring) * p,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }
            }
            // Halo
            drawCircle(
                brush = Brush.radialGradient(
                    listOf(color.copy(alpha = 0.32f), Color.Transparent),
                    center = center,
                    radius = ring * 1.25f,
                ),
                radius = ring * 1.25f,
            )
            // Anneau : complet, ou arc qui tourne pendant un démarrage
            val stroke = 7.dp.toPx()
            drawCircle(color = color.copy(alpha = 0.22f), radius = ring, style = Stroke(stroke))
            if (busy) {
                drawArc(
                    color = color,
                    startAngle = spin,
                    sweepAngle = 100f,
                    useCenter = false,
                    topLeft = Offset(center.x - ring, center.y - ring),
                    size = Size(ring * 2, ring * 2),
                    style = Stroke(stroke, cap = StrokeCap.Round),
                )
            } else {
                drawCircle(color = color, radius = ring, style = Stroke(stroke))
            }
        }
        Box(
            Modifier
                .size(104.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(CircleShape)
                .background(disc),
            contentAlignment = Alignment.Center,
        ) {
            Text(status.emoji, fontSize = 46.sp)
        }
    }
}
