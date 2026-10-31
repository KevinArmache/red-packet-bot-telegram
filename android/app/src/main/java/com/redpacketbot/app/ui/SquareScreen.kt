package com.redpacketbot.app.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.SquareEntry
import com.redpacketbot.app.SquareLog
import com.redpacketbot.app.ui.components.EmptyState
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.Pill
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.MonoStyle
import com.redpacketbot.app.ui.theme.Spacing

private const val BINANCE_PACKAGE = "com.binance.dev"
private const val MAX_SOURCES_SHOWN = 6

/** Filtres de l'onglet : vides = tout afficher. */
data class SquareFilters(
    /** quiz, direct ou vide */
    val type: String = "",
    /** USDT, BNB, other ou vide */
    val coin: String = "",
    /** Nom du canal, ou vide */
    val source: String = "",
    val answerOnly: Boolean = false,
    val oldestFirst: Boolean = false,
) {
    val active: Int get() = listOf(type.isNotEmpty(), coin.isNotEmpty(), source.isNotEmpty(), answerOnly).count { it }

    fun matches(entry: SquareEntry): Boolean = when {
        type.isNotEmpty() && entry.type != type -> false
        source.isNotEmpty() && source !in entry.sources -> false
        answerOnly && entry.answer.isEmpty() -> false
        coin == "other" && entry.coin in MAIN_COINS -> false
        coin.isNotEmpty() && coin != "other" && entry.coin != coin -> false
        else -> true
    }

    private companion object {
        val MAIN_COINS = listOf("USDT", "BNB")
    }
}

private data class SquareList(val key: String, val label: String)

private val LISTS = listOf(
    SquareList(SquareLog.TAKE, "🟢 À prendre"),
    SquareList(SquareLog.OPENED, "👆 Ouverts"),
    SquareList(SquareLog.WON, "🏆 Pris"),
    SquareList(SquareLog.DONE, "⚫ Terminés"),
)

/** Copie la réponse, puis ouvre le post dans l'appli Binance. */
private fun openPost(context: Context, entry: SquareEntry) {
    if (entry.answer.isNotEmpty()) {
        context.getSystemService(ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("Réponse Red Packet", entry.answer))
        Toast.makeText(context, "📋 Réponse copiée : ${entry.answer}", Toast.LENGTH_SHORT).show()
    }
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(entry.link))
    try {
        context.startActivity(Intent(intent).setPackage(BINANCE_PACKAGE))
    } catch (_: ActivityNotFoundException) {
        context.startActivity(intent)
    }
}

private fun typeLabel(type: String) = when (type) {
    "quiz" -> "🎯 Quiz"
    "direct" -> "⚡ Direct"
    else -> "🧧 Red Packet"
}

@Composable
fun SquareScreen(vm: BotViewModel) {
    val context = LocalContext.current
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val filters by vm.squareFilters.collectAsStateWithLifecycle()
    val log = snapshot.square
    val now = System.currentTimeMillis()
    var list by rememberSaveable { mutableStateOf(SquareLog.TAKE) }
    var showFilters by rememberSaveable { mutableStateOf(false) }
    // Post ouvert dans Binance : au retour, on demande s'il est pris
    var awaitingId by rememberSaveable { mutableStateOf<String?>(null) }
    var chaining by rememberSaveable { mutableStateOf(false) }
    var askingId by rememberSaveable { mutableStateOf<String?>(null) }

    val shown = log.inList(list, now).filter(filters::matches).let { entries ->
        if (filters.oldestFirst) entries.sortedBy { it.firstAt } else entries.sortedByDescending { it.firstAt }
    }
    val toTake = log.inList(SquareLog.TAKE, now).filter(filters::matches).sortedBy { it.firstAt }

    fun open(entry: SquareEntry) {
        vm.markSquare(entry.id, SquareLog.MARK_OPENED)
        awaitingId = entry.id
        openPost(context, entry)
    }

    /** Red Packet suivant de « À prendre » (celui qu'on vient de traiter y est encore). */
    fun openNext(doneId: String) {
        val next = toTake.firstOrNull { it.id != doneId }
        if (next != null) {
            open(next)
        } else {
            chaining = false
            Toast.makeText(context, "🎉 Plus rien à prendre", Toast.LENGTH_SHORT).show()
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        awaitingId?.let {
            askingId = it
            awaitingId = null
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = Spacing.l)) {
        ScreenHeader("🧧 Binance Square", "Liens repérés sur Telegram : tu ouvres, tu réponds")
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        ) {
            LISTS.forEach { item ->
                val count = log.inList(item.key, now).count(filters::matches)
                FilterChip(
                    selected = list == item.key,
                    onClick = { list = item.key },
                    label = { Text("${item.label} · $count") },
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { showFilters = !showFilters }) {
                Text("🎚️ Filtres" + if (filters.active > 0) " (${filters.active})" else "")
            }
            if (filters.active > 0) {
                TextButton(onClick = { vm.setSquareFilters(SquareFilters(oldestFirst = filters.oldestFirst)) }) { Text("✖️ Tout voir") }
            }
            if (list == SquareLog.TAKE && toTake.isNotEmpty()) {
                TextButton(onClick = {
                    chaining = true
                    open(toTake.first())
                }) { Text("▶️ Enchaîner") }
            }
        }
        if (showFilters) FiltersPanel(log, filters, vm::setSquareFilters)

        LazyColumn(contentPadding = PaddingValues(bottom = Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            if (shown.isEmpty()) {
                item {
                    when {
                        !snapshot.config.squareEnabled -> EmptyState(
                            "🧧",
                            "Binance Square désactivé",
                            "Active-le dans ⚙️ Réglages → Binance Square.",
                        )
                        log.items.isEmpty() -> EmptyState(
                            "🧧",
                            "Aucun lien pour l'instant",
                            "Abonne le compte Telegram de ce téléphone à tes canaux de liens (📡 Sources) : chaque lien " +
                                "s'affichera ici avec sa réponse.",
                        )
                        filters.active > 0 -> EmptyState("🎚️", "Rien avec ces filtres", "Touche « Tout voir » pour les retirer.")
                        else -> EmptyState("✅", "Rien dans cette liste", "Les nouveaux liens arrivent dans « À prendre ».")
                    }
                }
            }
            items(shown, key = { it.id }) { entry ->
                SquareCard(
                    entry = entry,
                    list = list,
                    now = now,
                    onOpen = { open(entry) },
                    onCopy = {
                        context.getSystemService(ClipboardManager::class.java)
                            .setPrimaryClip(ClipData.newPlainText("Réponse Red Packet", entry.answer))
                        Toast.makeText(context, "📋 Réponse copiée", Toast.LENGTH_SHORT).show()
                    },
                    onMark = { mark -> vm.markSquare(entry.id, mark) },
                    publishChannel = snapshot.config.publishChannel,
                )
            }
        }
    }

    log.items.firstOrNull { it.id == askingId }?.let { entry ->
        fun answer(mark: String?) {
            askingId = null
            if (mark != null) vm.markSquare(entry.id, mark)
            if (chaining) {
                if (mark != null) openNext(entry.id) else chaining = false
            }
        }
        AlertDialog(
            onDismissRequest = { answer(null) },
            title = { Text("🧧 Tu l'as pris ?") },
            text = {
                Text(
                    listOf(entry.coin, entry.answer).filter { it.isNotBlank() }.joinToString(" · ")
                        .ifEmpty { "Red Packet ${entry.id}" },
                )
            },
            confirmButton = { TextButton(onClick = { answer(SquareLog.MARK_WON) }) { Text("🏆 Pris") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { answer(null) }) { Text("Plus tard") }
                    TextButton(onClick = { answer(SquareLog.MARK_MISSED) }) { Text("❌ Raté") }
                }
            },
        )
    }
}

/** Type, crypto, canal, réponse connue, ordre : ce qui s'affiche dans la liste. */
@Composable
private fun FiltersPanel(log: SquareLog, filters: SquareFilters, onChange: (SquareFilters) -> Unit) {
    val sources = log.items.flatMap { it.sources }.groupingBy { it }.eachCount()
        .entries.sortedByDescending { it.value }.take(MAX_SOURCES_SHOWN).map { it.key }

    @Composable
    fun Choice(selected: Boolean, label: String, onClick: () -> Unit) {
        FilterChip(selected = selected, onClick = onClick, label = { Text(label, maxLines = 1) })
    }

    Column(Modifier.padding(bottom = Spacing.s), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        ) {
            Choice(filters.type == "quiz", "🎯 Quiz") { onChange(filters.copy(type = if (filters.type == "quiz") "" else "quiz")) }
            Choice(filters.type == "direct", "⚡ Direct") { onChange(filters.copy(type = if (filters.type == "direct") "" else "direct")) }
            Choice(filters.answerOnly, "✅ Réponse connue") { onChange(filters.copy(answerOnly = !filters.answerOnly)) }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        ) {
            for ((key, label) in listOf("USDT" to "USDT", "BNB" to "BNB", "other" to "Autres")) {
                Choice(filters.coin == key, "💰 $label") { onChange(filters.copy(coin = if (filters.coin == key) "" else key)) }
            }
            Choice(filters.oldestFirst, if (filters.oldestFirst) "⏳ Plus anciens d'abord" else "🆕 Plus récents d'abord") {
                onChange(filters.copy(oldestFirst = !filters.oldestFirst))
            }
        }
        if (sources.size > 1) {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            ) {
                sources.forEach { source ->
                    Choice(filters.source == source, "✈️ $source") {
                        onChange(filters.copy(source = if (filters.source == source) "" else source))
                    }
                }
            }
        }
    }
}

@Composable
private fun SquareCard(
    entry: SquareEntry,
    list: String,
    now: Long,
    onOpen: () -> Unit,
    onCopy: () -> Unit,
    onMark: (String) -> Unit,
    publishChannel: String,
) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            Pill(typeLabel(entry.type), if (entry.type == "direct") AppColors.gold else AppColors.info)
            if (entry.coin.isNotBlank()) Pill(entry.coin, AppColors.success)
            Text(
                Format.ago(entry.firstAt, now),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                modifier = Modifier.weight(1f).padding(start = Spacing.s),
            )
        }

        when {
            entry.answer.isNotEmpty() -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        entry.answer,
                        style = MonoStyle.copy(fontSize = 16.sp, lineHeight = 20.sp),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onCopy) { Text("📋") }
                }
                val best = entry.answers.first()
                Hint(
                    when {
                        best.from.size > 1 -> "✅ Confirmée par ${best.from.size} canaux"
                        else -> "✅ Donnée par ${best.from.firstOrNull() ?: "un canal"}"
                    },
                )
                if (entry.answers.size > 1) {
                    Hint(
                        "⚠️ Autre réponse donnée : " + entry.answers.drop(1).joinToString(" · ") { it.text },
                        AppColors.warning,
                    )
                }
            }
            entry.type == "direct" -> Hint("⚡ Pas de question : ouvre le post et réclame.")
            else -> Hint("❓ Réponse à trouver dans le post.")
        }
        if (entry.amount.isNotBlank()) Hint("💰 Annoncé par le canal : ${entry.amount} ${entry.coin}".trim())

        when (list) {
            SquareLog.TAKE, SquareLog.OPENED -> {
                Button(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
                    Text(if (entry.answer.isNotEmpty()) "🚀 Ouvrir et copier" else "🚀 Ouvrir dans Binance")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    OutlinedButton(onClick = { onMark(SquareLog.MARK_WON) }, modifier = Modifier.weight(1f)) { Text("🏆 Pris") }
                    OutlinedButton(onClick = { onMark(SquareLog.MARK_MISSED) }, modifier = Modifier.weight(1f)) { Text("❌ Raté") }
                    TextButton(onClick = { onMark(SquareLog.MARK_HIDDEN) }) { Text("🙈") }
                }
            }
            SquareLog.WON -> Hint(
                when {
                    entry.publishedAt > 0 -> "📣 Publié sur ton canal"
                    publishChannel.isBlank() -> "📣 Aucun canal réglé : rien n'est publié"
                    else -> "📣 Publication en attente (le bot doit tourner)"
                },
            )
            else -> OutlinedButton(onClick = onOpen, modifier = Modifier.fillMaxWidth()) { Text("🚀 Rouvrir") }
        }
    }
}
