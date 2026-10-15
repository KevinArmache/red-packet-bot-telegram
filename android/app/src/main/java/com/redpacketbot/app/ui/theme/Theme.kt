package com.redpacketbot.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.R
import com.redpacketbot.app.Tone

// ─── Couleurs : « rouge & or classique » ────────────────────────────────────
// Sombre : presque noir, cartes pleines gris très foncé, accents rouge
// enveloppe et or. Clair : même identité sur fond crème.

private val DarkColors = darkColorScheme(
    primary = Color(0xFFE53935),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF3A1214),
    onPrimaryContainer = Color(0xFFFFDAD6),
    secondary = Color(0xFFFFC107),
    onSecondary = Color(0xFF1F1600),
    secondaryContainer = Color(0xFF3A2C00),
    onSecondaryContainer = Color(0xFFFFE08A),
    tertiary = Color(0xFF4FC3F7),
    onTertiary = Color(0xFF002233),
    background = Color(0xFF0E0E12),
    onBackground = Color(0xFFF3F3F6),
    surface = Color(0xFF0E0E12),
    onSurface = Color(0xFFF3F3F6),
    surfaceVariant = Color(0xFF24242E),
    onSurfaceVariant = Color(0xFFA3A3B2),
    surfaceContainerLowest = Color(0xFF0A0A0D),
    surfaceContainerLow = Color(0xFF15151B),
    surfaceContainer = Color(0xFF1C1C24),
    surfaceContainerHigh = Color(0xFF24242E),
    surfaceContainerHighest = Color(0xFF2C2C38),
    outline = Color(0xFF3E3E4C),
    outlineVariant = Color(0xFF2E2E3A),
    error = Color(0xFFFF5A52),
    onError = Color(0xFF1A0000),
    errorContainer = Color(0xFF3B0D0B),
    onErrorContainer = Color(0xFFFFDAD6),
    inverseSurface = Color(0xFFF3F3F6),
    inverseOnSurface = Color(0xFF1C1C24),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFFC62828),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDAD6),
    onPrimaryContainer = Color(0xFF410002),
    secondary = Color(0xFF8D6E00),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE08A),
    onSecondaryContainer = Color(0xFF2B2000),
    tertiary = Color(0xFF0277BD),
    onTertiary = Color.White,
    background = Color(0xFFFFF8F6),
    onBackground = Color(0xFF1F1A19),
    surface = Color(0xFFFFF8F6),
    onSurface = Color(0xFF1F1A19),
    surfaceVariant = Color(0xFFF5DFDB),
    onSurfaceVariant = Color(0xFF5F5452),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFFFF1EE),
    surfaceContainerHigh = Color(0xFFFBE9E6),
    surfaceContainerHighest = Color(0xFFF5DFDB),
    outline = Color(0xFF857370),
    outlineVariant = Color(0xFFEAD8D5),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

/** Couleurs d'état (succès, alerte…) et dégradés, en plus du schéma Material. */
@Immutable
data class ExtraColors(
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val idle: Color,
    val gold: Color,
    val heroGradient: Brush,
    val goldGradient: Brush,
    val terminalBg: Color,
    val terminalText: Color,
    val isDark: Boolean,
) {
    fun of(tone: Tone): Color = when (tone) {
        Tone.OK -> success
        Tone.INFO -> info
        Tone.BUSY -> gold
        Tone.IDLE -> idle
        Tone.WARN -> warning
        Tone.DANGER -> danger
    }
}

private val DarkExtra = ExtraColors(
    success = Color(0xFF4ADE80),
    warning = Color(0xFFFFB020),
    danger = Color(0xFFFF5A52),
    info = Color(0xFF4FC3F7),
    idle = Color(0xFF8E8E9E),
    gold = Color(0xFFFFC107),
    heroGradient = Brush.linearGradient(listOf(Color(0xFF3A1214), Color(0xFF1C1C24), Color(0xFF15151B))),
    goldGradient = Brush.linearGradient(listOf(Color(0xFFFFD54F), Color(0xFFFFA000))),
    terminalBg = Color(0xFF0B0B0F),
    terminalText = Color(0xFFD6D6DE),
    isDark = true,
)

private val LightExtra = ExtraColors(
    success = Color(0xFF2E7D32),
    warning = Color(0xFFE65100),
    danger = Color(0xFFC62828),
    info = Color(0xFF0277BD),
    idle = Color(0xFF757575),
    gold = Color(0xFF8D6E00),
    heroGradient = Brush.linearGradient(listOf(Color(0xFFFFDAD6), Color(0xFFFFF1EE), Color.White)),
    goldGradient = Brush.linearGradient(listOf(Color(0xFFFFC107), Color(0xFFFF8F00))),
    // Le terminal des logs reste sombre dans les deux thèmes
    terminalBg = Color(0xFF14141A),
    terminalText = Color(0xFFD6D6DE),
    isDark = false,
)

val LocalExtraColors = staticCompositionLocalOf { DarkExtra }

/** Raccourci : `AppColors.success`, `AppColors.of(tone)`… */
val AppColors: ExtraColors
    @Composable @ReadOnlyComposable get() = LocalExtraColors.current

// ─── Typographie : Inter (OFL), chiffres tabulaires pour les compteurs ─────

@OptIn(ExperimentalTextApi::class)
private fun inter(weight: Int) = Font(
    R.font.inter,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val Inter = FontFamily(inter(400), inter(500), inter(600), inter(700), inter(800))

private fun style(size: Int, weight: Int, line: Int, spacing: Double = 0.0) = TextStyle(
    fontFamily = Inter,
    fontWeight = FontWeight(weight),
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = spacing.sp,
)

private val AppTypography = Typography(
    displayMedium = style(34, 700, 40, -0.5).copy(fontFeatureSettings = "tnum"),
    displaySmall = style(28, 700, 34, -0.25).copy(fontFeatureSettings = "tnum"),
    headlineSmall = style(22, 700, 28),
    titleLarge = style(20, 600, 26),
    titleMedium = style(16, 600, 22),
    titleSmall = style(14, 600, 20),
    bodyLarge = style(15, 400, 22),
    bodyMedium = style(14, 400, 20),
    bodySmall = style(12, 400, 17),
    labelLarge = style(14, 600, 20),
    labelMedium = style(12, 500, 16, 0.2),
    labelSmall = style(11, 500, 14, 0.3),
)

/** Codes et logs : police à chasse fixe. */
val MonoStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 16.sp)

/** Grands chiffres des cartes de stats. */
val NumberStyle = TextStyle(
    fontFamily = Inter,
    fontWeight = FontWeight(700),
    fontSize = 24.sp,
    lineHeight = 28.sp,
    fontFeatureSettings = "tnum",
)

// ─── Formes et espacements ──────────────────────────────────────────────────

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

object Spacing {
    val xs = 4.dp
    val s = 8.dp
    val m = 12.dp
    val l = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
}

@Composable
fun RedPacketTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors: ColorScheme = if (dark) DarkColors else LightColors
    CompositionLocalProvider(LocalExtraColors provides if (dark) DarkExtra else LightExtra) {
        MaterialTheme(colorScheme = colors, typography = AppTypography, shapes = AppShapes, content = content)
    }
}
