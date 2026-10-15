package com.redpacketbot.app.ui.components

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.ClaimEntry
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.MonoStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sin
import kotlin.random.Random

private val CONFETTI = listOf("🎉", "✨", "🪙", "🧧", "💰", "⭐")

private class Particle(val emoji: String, val x: Float, val delay: Float, val speed: Float, val sway: Float, val size: Int)

/**
 * 🧧 Un code vient d'être gagné (app ouverte) : l'enveloppe grandit, s'ouvre
 * en 💰 avec le montant, pluie d'émojis et vibration. Un appui ferme.
 */
@Composable
fun WinCelebration(entry: ClaimEntry, onDone: () -> Unit) {
    val view = LocalView.current
    val envelope = remember { Animatable(0.2f) }
    val rain = remember { Animatable(0f) }
    var opened by remember { mutableStateOf(false) }
    val particles = remember {
        val random = Random(entry.at)
        List(30) {
            Particle(
                emoji = CONFETTI[random.nextInt(CONFETTI.size)],
                x = random.nextFloat(),
                delay = random.nextFloat() * 0.35f,
                speed = 0.7f + random.nextFloat() * 0.6f,
                sway = random.nextFloat() * 6.28f,
                size = 18 + random.nextInt(14),
            )
        }
    }

    LaunchedEffect(entry.at) {
        view.performHapticFeedback(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM
            else HapticFeedbackConstants.LONG_PRESS,
        )
        launch { rain.animateTo(1f, tween(3200, easing = LinearEasing)) }
        envelope.animateTo(1.15f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        delay(350)
        opened = true
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        envelope.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
        delay(3200)
        onDone()
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDone),
        contentAlignment = Alignment.Center,
    ) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        particles.forEach { p ->
            val t = ((rain.value - p.delay) / (1f - p.delay)).coerceIn(0f, 1f)
            if (t > 0f && t < 1f) {
                val y = -80f + (heightPx + 160f) * t * p.speed
                val x = widthPx * p.x + sin(p.sway + t * 9f) * 40f
                Text(
                    p.emoji,
                    fontSize = p.size.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .offset { IntOffset(x.toInt(), y.toInt()) }
                        .graphicsLayer { rotationZ = t * 360f * (if (p.x > 0.5f) 1 else -1) },
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AnimatedContent(
                targetState = opened,
                transitionSpec = { (scaleIn() + fadeIn()) togetherWith fadeOut() },
                label = "envelope",
            ) { isOpen ->
                Text(
                    if (isOpen) "💰" else "🧧",
                    fontSize = 96.sp,
                    modifier = Modifier.graphicsLayer {
                        scaleX = envelope.value
                        scaleY = envelope.value
                    },
                )
            }
            Text("Gagné !", style = MaterialTheme.typography.headlineSmall, color = AppColors.gold)
            if (entry.gain.isNotBlank()) {
                Text("+${entry.gain}", style = MaterialTheme.typography.displaySmall, color = Color.White, textAlign = TextAlign.Center)
            }
            Text(
                entry.code + if (entry.channel.isNotBlank()) " · ${entry.channel}" else "",
                style = MonoStyle,
                color = Color.White.copy(alpha = 0.8f),
            )
            Text("Touche pour fermer", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.6f))
        }
    }
}

