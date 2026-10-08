package com.redpacketbot.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.AppFiles
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile

private val ANSI = Regex("\u001B\\[[0-9;]*m")

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

private fun colorOf(line: String): Color = when {
    "ERROR" in line || "❌" in line || "💥" in line -> Color(0xFFC62828)
    "WARN" in line || "⚠️" in line -> Color(0xFFE65100)
    "✅" in line || "💰" in line -> Color(0xFF2E7D32)
    else -> Color(0xFF263238)
}

@Composable
fun LogsScreen() {
    val context = LocalContext.current
    val files = remember { AppFiles(context) }
    var lines by remember { mutableStateOf(emptyList<String>()) }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        while (true) {
            val fresh = withContext(Dispatchers.IO) { tail(files.logFile) }
            if (fresh != lines) {
                val atBottom = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index
                    ?.let { it >= lines.size - 2 } ?: true
                lines = fresh
                if (atBottom && fresh.isNotEmpty()) listState.scrollToItem(fresh.size - 1)
            }
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                context.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("Logs Red Packet Bot", lines.joinToString("\n")))
                Toast.makeText(context, "Logs copiés", Toast.LENGTH_SHORT).show()
            }) { Text("Copier") }
            OutlinedButton(onClick = {
                val send = Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, lines.takeLast(200).joinToString("\n"))
                context.startActivity(Intent.createChooser(send, "Partager les logs"))
            }) { Text("Partager") }
        }
        if (lines.isEmpty()) {
            Text("Pas encore de logs : démarre le bot.", Modifier.padding(16.dp))
        }
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            items(lines) { line ->
                Text(
                    line,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    color = colorOf(line),
                    modifier = Modifier.padding(vertical = 1.dp),
                )
            }
        }
    }
}
