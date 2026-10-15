package com.redpacketbot.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.NumberStyle
import com.redpacketbot.app.ui.theme.Spacing

/** Carte de section : titre (avec émoji), sous-titre, élément à droite, contenu. */
@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    background: Brush? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            Modifier
                .then(if (background != null) Modifier.background(background) else Modifier)
                .padding(Spacing.l),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            if (title != null || trailing != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        title?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
                        subtitle?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    trailing?.invoke()
                }
            }
            content()
        }
    }
}

/** Petite carte de chiffre : émoji, grande valeur, libellé, précision. */
@Composable
fun StatCard(
    emoji: String,
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    caption: String? = null,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(horizontal = Spacing.m, vertical = Spacing.m)) {
            Text(emoji, fontSize = 20.sp)
            Spacer(Modifier.size(6.dp))
            Text(
                value,
                // Taille adaptée à la longueur : un montant n'est jamais coupé
                style = NumberStyle.copy(
                    fontSize = when {
                        value.length <= 7 -> 24.sp
                        value.length <= 10 -> 19.sp
                        value.length <= 13 -> 16.sp
                        else -> 14.sp
                    },
                ),
                color = accent ?: MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
            )
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            caption?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Pastille colorée : « 🩺 11/12 », « 🟠 Codes clairs »… */
@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Box(
        modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.16f))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = color, maxLines = 1)
    }
}

/** Ligne d'information : émoji, titre, détail, élément à droite. */
@Composable
fun InfoRow(
    emoji: String,
    title: String,
    detail: String? = null,
    modifier: Modifier = Modifier,
    detailColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EmojiBadge(emoji)
        Spacer(Modifier.width(Spacing.m))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            if (!detail.isNullOrBlank()) {
                Text(detail, style = MaterialTheme.typography.bodySmall, color = detailColor)
            }
        }
        trailing()
    }
}

/** Émoji dans un carré arrondi (icône des lignes et des réglages). */
@Composable
fun EmojiBadge(emoji: String, size: Int = 36, tint: Color = MaterialTheme.colorScheme.surfaceContainerHigh) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape((size / 3).dp)).background(tint),
        contentAlignment = Alignment.Center,
    ) {
        Text(emoji, fontSize = (size * 0.5f).sp)
    }
}

/**
 * Ligne de liste à cocher : ✅ / ⚠️ / ❔, titre, détail, action à droite
 * (mêmes pastilles qu'avant la refonte).
 */
@Composable
fun CheckRow(ok: Boolean?, title: String, detail: String = "", action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        EmojiBadge(
            when (ok) {
                true -> "✅"
                false -> "⚠️"
                null -> "❔"
            },
            size = 32,
            tint = when (ok) {
                true -> AppColors.success.copy(alpha = 0.14f)
                false -> AppColors.warning.copy(alpha = 0.16f)
                null -> MaterialTheme.colorScheme.surfaceContainerHigh
            },
        )
        Spacer(Modifier.width(Spacing.m))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            if (detail.isNotEmpty()) {
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(Spacing.s))
        action()
    }
}

/** Texte d'aide discret. */
@Composable
fun Hint(text: String, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = color)
}

/** Bandeau de message (erreur, alerte, info) avec un émoji. */
@Composable
fun Banner(emoji: String, text: String, color: Color, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(color.copy(alpha = 0.12f))
            .padding(Spacing.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 18.sp)
        Spacer(Modifier.width(Spacing.m))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
        action?.let {
            Spacer(Modifier.width(Spacing.s))
            it()
        }
    }
}

/** État vide : grand émoji, titre, explication. */
@Composable
fun EmptyState(emoji: String, title: String, text: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(vertical = Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(emoji, fontSize = 40.sp)
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** Titre de groupe au-dessus des cartes. */
@Composable
fun GroupLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(start = 4.dp, top = Spacing.s),
    )
}
