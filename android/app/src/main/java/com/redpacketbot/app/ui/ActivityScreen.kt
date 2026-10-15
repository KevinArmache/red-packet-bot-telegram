package com.redpacketbot.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.AppFiles
import com.redpacketbot.app.ui.components.ClaimRow
import com.redpacketbot.app.ui.components.EmptyState
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.MonoStyle
import com.redpacketbot.app.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile

@Composable
fun ActivityScreen(vm: BotViewModel, startOnLogs: Boolean) {
    var showLogs by rememberSaveable { mutableStateOf(startOnLogs) }
    Column(Modifier.fillMaxSize().padding(horizontal = Spacing.l)) {
        ScreenHeader("📜 Activité", if (showLogs) "Ce que le bot écrit, en direct" else "Les 50 derniers codes et leur résultat")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(vertical = Spacing.s)) {
            SegmentedButton(
                selected = !showLogs,
                onClick = { showLogs = false },
                shape = SegmentedButtonDefaults.itemShape(0, 2),
            ) { Text("🎁 Codes") }
            SegmentedButton(
                selected = showLogs,
                onClick = { showLogs = true },
                shape = SegmentedButtonDefaults.itemShape(1, 2),
            ) { Text("🖥️ Logs") }
        }
        if (showLogs) LogsPanel() else CodesPanel(vm)
    }
}

@Composable
private fun CodesPanel(vm: BotViewModel) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val items = snapshot.activity.items
    if (items.isEmpty()) {
        EmptyState(
            "📭",
            "Aucun code pour l'instant",
            "Chaque code trouvé sur Telegram ou X s'affiche ici avec son résultat : gagné, refusé, sauté par " +
                "l'anti-blocage ou laissé au PC.",
        )
        return
    }
    LazyColumn(contentPadding = PaddingValues(bottom = Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
        item {
            SectionCard {
                items.forEachIndexed { index, entry ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    ClaimRow(entry)
                }
            }
        }
    }
}

// ─── Logs ───────────────────────────────────────────────────────────────────

private val ANSI = Regex("\u001B\\[[0-9;]*m")
private val CODE_LINE = Regex("🎁|💰|🏁|⏭️ Code|🛡️ Code|🤝 Code|🐦|📨|🧪|GAGNÉ")
private val ERROR_LINE = Regex("ERROR|WARN|❌|💥|⚠️")

/** Les dernières lignes de logs/bot.log (sans relire tout le fichier). */
private fun tail(file: File, maxBytes: Int = 96 * 1024, maxLines: Int = 400): List<String> {
    if (!file.exists()) return emptyList()
    return try {
        RandomAccessFile(file, "r").use { raf ->
            val start = (raf.length() - maxBytes).coerceAtLeast(0)
            raf.seek(start)
            val bytes = ByteArray((raf.length() - start).toInt())
            raf.readFully(bytes)
            val lines = bytes.decodeToString().replace(ANSI, "").lines()
            (if (start > 0) lines.drop(1) else lines).filter { it.isNotBlank() }.takeLast(maxLines)
        }
    } catch (_: Exception) {
        emptyList()
    }
}

/**
 * Vide logs/bot.log et supprime l'archive bot.log.1. Le bot écrit en fin de
 * fichier (ajout) : ses lignes suivantes repartent simplement de zéro.
 */
private fun clearLogs(file: File) {
    try {
        if (file.exists()) RandomAccessFile(file, "rw").use { it.setLength(0) }
        File(file.path + ".1").delete()
    } catch (_: Exception) {
        /* fichier occupé ou absent : rien à effacer */
    }
}

@Composable
private fun lineColor(line: String, default: Color): Color = when {
    "ERROR" in line || "❌" in line || "💥" in line -> AppColors.danger.copy(alpha = 0.95f)
    "WARN" in line || "⚠️" in line -> Color(0xFFFFB020)
    "💰" in line || "GAGNÉ" in line || "🎁" in line -> Color(0xFFFFC107)
    "✅" in line || " OK " in line -> Color(0xFF4ADE80)
    else -> default
}

@Composable
private fun LogsPanel() {
    val context = LocalContext.current
    val files = remember { AppFiles(context) }
    var lines by remember { mutableStateOf(emptyList<String>()) }
    var filter by rememberSaveable { mutableStateOf("all") }
    var follow by rememberSaveable { mutableStateOf(true) }
    var confirmClear by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    // Relu toutes les 2 s, seulement quand cet onglet est affiché
    LaunchedEffect(Unit) {
        while (true) {
            val fresh = withContext(Dispatchers.IO) { tail(files.logFile) }
            if (fresh != lines) lines = fresh
            delay(2000)
        }
    }
    val shown = when (filter) {
        "codes" -> lines.filter { CODE_LINE.containsMatchIn(it) }
        "errors" -> lines.filter { ERROR_LINE.containsMatchIn(it) }
        else -> lines
    }
    LaunchedEffect(shown.size, follow) {
        if (follow && shown.isNotEmpty()) listState.scrollToItem(shown.size - 1)
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            FilterChip(selected = filter == "all", onClick = { filter = "all" }, label = { Text("Tout") })
            FilterChip(selected = filter == "codes", onClick = { filter = "codes" }, label = { Text("🎁 Codes") })
            FilterChip(selected = filter == "errors", onClick = { filter = "errors" }, label = { Text("⚠️ Erreurs") })
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            TextButton(onClick = { follow = !follow }) { Text(if (follow) "⏸️ Pause" else "▶️ Suivre") }
            TextButton(onClick = {
                context.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("Logs Red Packet Bot", lines.joinToString("\n")))
                Toast.makeText(context, "Logs copiés", Toast.LENGTH_SHORT).show()
            }) { Text("📋 Copier") }
            TextButton(onClick = {
                val send = Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, lines.takeLast(200).joinToString("\n"))
                context.startActivity(Intent.createChooser(send, "Partager les logs"))
            }) { Text("📤 Partager") }
            TextButton(onClick = { confirmClear = true }) { Text("🗑️") }
        }

        val terminal = AppColors.terminalBg
        val text = AppColors.terminalText
        if (shown.isEmpty()) {
            EmptyState(
                "🖥️",
                if (lines.isEmpty()) "Pas encore de logs" else "Rien pour ce filtre",
                if (lines.isEmpty()) "Les prochaines lignes du bot s'afficheront ici (s'il est arrêté, démarre-le depuis l'Accueil)."
                else "Choisis « Tout » pour voir toutes les lignes.",
            )
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = Spacing.s)
                    .clip(MaterialTheme.shapes.medium)
                    .background(terminal),
                contentPadding = PaddingValues(Spacing.m),
            ) {
                items(shown) { line ->
                    Text(
                        line,
                        style = MonoStyle.copy(fontSize = 11.sp, lineHeight = 15.sp),
                        color = lineColor(line, text),
                        modifier = Modifier.padding(vertical = 1.dp),
                    )
                }
            }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("🗑️ Effacer les logs ?") },
            text = { Text("Les logs affichés ici sont vidés. Le bot continue de tourner et écrit les suivants.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    clearLogs(files.logFile)
                    lines = emptyList()
                    Toast.makeText(context, "Logs effacés", Toast.LENGTH_SHORT).show()
                }) { Text("Effacer") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Annuler") } },
        )
    }
}
