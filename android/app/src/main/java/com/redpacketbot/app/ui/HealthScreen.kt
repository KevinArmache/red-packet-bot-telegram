package com.redpacketbot.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.redpacketbot.app.Health
import kotlinx.coroutines.delay

@Composable
fun HealthScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("health", Context.MODE_PRIVATE) }
    // Revérifié toutes les 2 s : tu reviens des réglages Android, l'écran se met à jour
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(2000)
            tick++
        }
    }
    val items = remember(tick) { Health.check(context) }
    val snapshot by rememberSnapshot()

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Section("🩺 Santé du téléphone") {
            Hint(
                "Sans ces réglages, Android (et Phone Master sur Tecno) finit par couper le bot écran " +
                    "éteint. Fais-les une fois ; les points ✅ sont vérifiés automatiquement, coche les autres " +
                    "quand c'est fait.",
            )
            val heartbeat = snapshot.heartbeat
            if (snapshot.isRunning && heartbeat != null) {
                Hint(
                    if (heartbeat.sleeps == 0) "💤 Aucune mise en veille forcée détectée depuis le démarrage."
                    else "💤 Android a endormi le bot ${heartbeat.sleeps} fois depuis le démarrage : refais les réglages.",
                    if (heartbeat.sleeps == 0) Green else Orange,
                )
            }
        }
        Section("Réglages") {
            items.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider()
                val manualDone = prefs.getBoolean(item.key, false)
                CheckRow(
                    ok = item.ok ?: if (manualDone) true else null,
                    title = item.title,
                    detail = item.detail,
                ) {
                    Column {
                        item.actionLabel?.let { label ->
                            OutlinedButton(onClick = { open(context, item.intent(context)) }) { Text(label) }
                        }
                        if (item.ok == null) {
                            Checkbox(checked = manualDone, onCheckedChange = {
                                prefs.edit().putBoolean(item.key, it).apply()
                                tick++
                            })
                        }
                    }
                }
            }
        }
        Section("🧪 Test conseillé") {
            Hint(
                "Démarre le bot, verrouille le téléphone 10 minutes, puis reviens ici : si « Android a endormi " +
                    "le bot » apparaît, un réglage manque (souvent Phone Master ou la batterie).",
            )
        }
    }
}

private fun open(context: Context, intent: Intent?) {
    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
    try {
        context.startActivity((intent ?: fallback).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        context.startActivity(fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: SecurityException) {
        context.startActivity(fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
