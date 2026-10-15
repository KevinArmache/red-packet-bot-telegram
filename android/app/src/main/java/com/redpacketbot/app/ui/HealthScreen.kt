package com.redpacketbot.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.Health
import com.redpacketbot.app.ui.components.Banner
import com.redpacketbot.app.ui.components.CheckRow
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.ScreenList
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.NumberStyle
import com.redpacketbot.app.ui.theme.Spacing

@Composable
fun HealthScreen(vm: BotViewModel, onBack: () -> Unit) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val health by vm.health.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.refreshHealth() }
    val critical = health.items.filter { it.critical }
    val recommended = health.items.filter { !it.critical }

    ScreenList {
        item { ScreenHeader("🩺 Santé du téléphone", "Ce qu'Android doit laisser faire au bot, 24 h/24", onBack = onBack) }
        item {
            SectionCard {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    val color = when {
                        health.criticalMissing > 0 -> AppColors.danger
                        health.okCount < health.total -> AppColors.warning
                        else -> AppColors.success
                    }
                    Text("${health.okCount}/${health.total}", style = NumberStyle.copy(color = color))
                    Hint(
                        when {
                            health.criticalMissing > 0 -> "🚨 ${health.criticalMissing} réglage(s) indispensable(s) à corriger"
                            health.okCount < health.total -> "Encore quelques points recommandés"
                            else -> "✨ Tout est en ordre"
                        },
                    )
                }
                LinearProgressIndicator(
                    progress = { if (health.total == 0) 0f else health.okCount / health.total.toFloat() },
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColors.gold,
                    trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                )
                Hint(
                    "Sans ces réglages, Android (et Phone Master sur Tecno) finit par couper le bot écran éteint. " +
                        "Les points ✅ sont vérifiés tout seuls ; coche les autres quand c'est fait.",
                )
                val heartbeat = snapshot.liveHeartbeat
                if (heartbeat != null) {
                    if (heartbeat.sleeps == 0) {
                        Banner("💤", "Aucune mise en veille forcée détectée depuis le démarrage.", AppColors.success)
                    } else {
                        Banner("💤", "Android a endormi le bot ${heartbeat.sleeps} fois depuis le démarrage : refais les réglages.", AppColors.warning)
                    }
                }
            }
        }
        item { SectionCard(title = "🚨 Indispensables") { HealthList(vm, health, critical) } }
        if (recommended.isNotEmpty()) {
            item { SectionCard(title = "👍 Recommandés") { HealthList(vm, health, recommended) } }
        }
        item {
            SectionCard(title = "🧪 Test conseillé") {
                Hint(
                    "Démarre le bot, verrouille le téléphone 10 minutes, puis reviens ici : si « Android a endormi " +
                        "le bot » apparaît, un réglage manque (souvent Phone Master ou la batterie).",
                )
            }
        }
    }
}

/** Liste de réglages à vérifier, chacun avec son bouton et, si manuel, sa case à cocher. */
@Composable
fun HealthList(vm: BotViewModel, report: HealthReport, items: List<Health.Item>) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        items.forEachIndexed { index, item ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            CheckRow(report.isDone(item), item.title, item.detail) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    item.actionLabel?.let { label ->
                        if (item.ok != true) {
                            OutlinedButton(onClick = { open(context, item.intent(context)) }) { Text(label) }
                        }
                    }
                    if (item.ok == null) {
                        Checkbox(checked = report.manual[item.key] == true, onCheckedChange = { vm.setManualDone(item.key, it) })
                    }
                }
            }
        }
    }
}
