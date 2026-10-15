package com.redpacketbot.app.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.AppVersion
import com.redpacketbot.app.BotState
import com.redpacketbot.app.BotStatus
import com.redpacketbot.app.Status
import com.redpacketbot.app.Tone
import com.redpacketbot.app.ui.components.AntibanGauge
import com.redpacketbot.app.ui.components.Banner
import com.redpacketbot.app.ui.components.ClaimRow
import com.redpacketbot.app.ui.components.EmptyState
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.HourBars
import com.redpacketbot.app.ui.components.Pill
import com.redpacketbot.app.ui.components.RelayCard
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.ScreenList
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.components.StatCard
import com.redpacketbot.app.ui.components.StatusOrb
import com.redpacketbot.app.ui.components.antibanLevel
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing

@Composable
fun HomeScreen(vm: BotViewModel, onNavigate: (String) -> Unit) {
    val context = LocalContext.current
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val health by vm.health.collectAsStateWithLifecycle()
    val heartbeat = snapshot.liveHeartbeat
    var confirmStop by rememberSaveable { mutableStateOf(false) }
    val now = System.currentTimeMillis()

    // Processus du bot tué sans prévenir : l'état « en marche » est périmé
    val status = if (snapshot.status == BotState.RUNNING && !snapshot.isRunning) {
        BotStatus("stopped", Tone.IDLE, "⏹️", "Bot arrêté", "Plus de signe de vie : touche pour le démarrer.")
    } else {
        Status.model(snapshot.state, heartbeat)
    }

    ScreenList {
        item {
            ScreenHeader("🧧 Red Packet Bot") {
                if (health.total > 0) {
                    val color = when {
                        health.criticalMissing > 0 -> AppColors.danger
                        health.okCount < health.total -> AppColors.warning
                        else -> AppColors.success
                    }
                    Pill("🩺 ${health.okCount}/${health.total}", color, onClick = { onNavigate(Routes.HEALTH) })
                }
            }
        }

        // ── Bouton d'état ──────────────────────────────────────────────────
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                StatusOrb(
                    status = status,
                    onTap = {
                        when {
                            snapshot.canStop -> confirmStop = true
                            snapshot.config.isComplete -> vm.start()
                            else -> onNavigate(Routes.WIZARD)
                        }
                    },
                    onLongPress = if (snapshot.canStop) {
                        {
                            vm.restart()
                            Toast.makeText(context, "🔄 Redémarrage du bot…", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        null
                    },
                )
                Text(status.title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                val since = heartbeat?.startedAt?.takeIf { it > 0 && status.phase in listOf("active", "standby", "checking") }
                if (since != null) {
                    Text(
                        "en marche depuis ${Format.duration(now - since)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = AppColors.of(status.tone),
                    )
                }
                if (status.detail.isNotBlank()) {
                    Text(
                        status.detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = Spacing.l, vertical = 4.dp),
                    )
                }
                Hint(
                    when {
                        snapshot.canStop -> "Touche pour arrêter · appui long pour redémarrer"
                        snapshot.config.isComplete -> "Touche pour démarrer"
                        else -> "Touche pour terminer la mise en route"
                    },
                )
            }
        }

        // ── Problèmes ──────────────────────────────────────────────────────
        if (!snapshot.isRunning || snapshot.status != BotState.RUNNING) {
            Status.lastError(snapshot.state)?.let { error ->
                item { Banner("❌", error, AppColors.danger) }
            }
        }
        if (heartbeat != null && heartbeat.sleeps > 0) {
            item {
                Banner("💤", "Android a endormi le bot ${heartbeat.sleeps} fois depuis le démarrage.", AppColors.warning) {
                    TextButton(onClick = { onNavigate(Routes.HEALTH) }) { Text("🩺 Santé") }
                }
            }
        }

        // ── Mise en route inachevée ────────────────────────────────────────
        val remaining = listOf(
            !snapshot.config.isComplete,
            !snapshot.telegramOk,
            health.criticalMissing > 0,
        ).count { it }
        if (remaining > 0) {
            item {
                Banner("🧭", "Mise en route : $remaining étape(s) à terminer.", AppColors.gold) {
                    TextButton(onClick = { onNavigate(Routes.WIZARD) }) { Text("Continuer") }
                }
            }
        }

        // ── Relais PC ⇄ téléphone ──────────────────────────────────────────
        if (snapshot.config.botRole != "solo") {
            item { RelayCard(heartbeat, snapshot.isRunning) }
        }

        // ── Chiffres ───────────────────────────────────────────────────────
        item { StatsGrid(snapshot) }

        item {
            val slots = snapshot.activity.last24h(now)
            SectionCard(
                title = "📈 Dernières 24 h",
                subtitle = "${slots.sumOf { it.detected }} détecté(s) · ${slots.sumOf { it.won }} gagné(s)",
            ) {
                HourBars(slots)
            }
        }

        // ── Anti-blocage ───────────────────────────────────────────────────
        item {
            val (levelText, levelColor) = antibanLevel(heartbeat?.antiban ?: "normal", heartbeat?.pauseUntil ?: 0L)
            SectionCard(
                title = "🛡️ Anti-blocage Binance",
                subtitle = "${heartbeat?.fails ?: 0} code(s) faux d'affilée",
                trailing = { Pill(levelText, levelColor) },
            ) {
                AntibanGauge(
                    fails = heartbeat?.fails ?: 0,
                    selectiveAt = heartbeat?.selectiveAt ?: snapshot.config.antibanSelectiveAt.toIntOrNull() ?: 8,
                    stopAt = heartbeat?.stopAt ?: if (snapshot.config.antibanMode == "stop") {
                        snapshot.config.antibanStopAt.toIntOrNull() ?: 9
                    } else {
                        0
                    },
                )
                if (heartbeat?.antiban == "halt") {
                    Banner(
                        "⛔",
                        "Le bot ne tape plus aucun code. Pour reprendre : réclame toi-même un code qui marche dans " +
                            "l'appli Binance, puis envoie #reprendre dans tes Messages enregistrés Telegram.",
                        AppColors.danger,
                    )
                }
                if (heartbeat == null) Hint("Démarre le bot pour suivre le compteur en direct.")
            }
        }

        // ── Derniers codes ─────────────────────────────────────────────────
        item {
            val items = snapshot.activity.items.take(5)
            SectionCard(
                title = "🎁 Derniers codes",
                trailing = {
                    TextButton(onClick = { onNavigate(Routes.ACTIVITY) }) { Text("Tout voir →") }
                },
            ) {
                if (items.isEmpty()) {
                    EmptyState("📭", "Aucun code pour l'instant", "Les codes trouvés sur Telegram et X s'afficheront ici.")
                } else {
                    items.forEachIndexed { index, entry ->
                        if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        ClaimRow(entry)
                    }
                }
            }
        }

        item { AboutFooter() }
    }

    if (confirmStop) {
        AlertDialog(
            onDismissRequest = { confirmStop = false },
            title = { Text("⏹️ Arrêter le bot ?") },
            text = {
                Text(
                    "Plus aucun code ne sera réclamé par le téléphone jusqu'à ce que tu le redémarres." +
                        if (snapshot.config.botRole == "backup") " Le PC continue de réclamer s'il tourne." else "",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmStop = false
                    vm.stop()
                }) { Text("Arrêter") }
            },
            dismissButton = { TextButton(onClick = { confirmStop = false }) { Text("Annuler") } },
        )
    }
}

/** Cartes de chiffres : gains du jour, gagnés, détectés, réussite, latence, refusés. */
@Composable
private fun StatsGrid(snapshot: Snapshot) {
    val heartbeat = snapshot.liveHeartbeat
    val activity = snapshot.activity
    // Le total dans la devise choisie d'abord (court et lisible), les cryptos en dessous
    val money = LocalMoney.current
    val gains = activity.gainsToday.entries.sortedByDescending { it.value }
    val gainValue = when {
        activity.gainsTodayUsd > 0 -> "≈ ${money.primary(activity.gainsTodayUsd)}"
        gains.isNotEmpty() -> "≈ …" // prix en cours de lecture
        else -> money.primary(0.0)
    }
    val coins = when {
        gains.isEmpty() -> "aujourd'hui"
        gains.size == 1 -> "${Format.amount(gains[0].value)} ${gains[0].key}"
        else -> "${Format.amount(gains[0].value)} ${gains[0].key} + ${gains.size - 1} autre(s)"
    }
    // Mode « les deux » : la 2e devise en premier sous le montant
    val gainCaption = money.secondary(activity.gainsTodayUsd)
        ?.takeIf { activity.gainsTodayUsd > 0 }
        ?.let { "≈ $it\n$coins" } ?: coins
    val claimed = heartbeat?.claimed ?: 0
    val won = heartbeat?.won ?: 0

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            StatCard("💰", gainValue, "gains du jour", Modifier.weight(1.3f), accent = AppColors.gold, caption = gainCaption)
            StatCard("🏆", "$won", "gagnés", Modifier.weight(1f), caption = "depuis le démarrage")
            StatCard("🎁", "${heartbeat?.detected ?: 0}", "détectés", Modifier.weight(1f), caption = "depuis le démarrage")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            StatCard(
                "🎯",
                if (claimed > 0) "${won * 100 / claimed} %" else "—",
                "réussite",
                Modifier.weight(1f),
                caption = "$claimed tenté(s)",
            )
            StatCard(
                "⚡",
                Format.latency(heartbeat?.avgWaitMs?.takeIf { claimed > 0 }),
                "avant saisie",
                Modifier.weight(1f),
                caption = "en moyenne",
            )
            StatCard(
                "❌",
                "${heartbeat?.failed ?: 0}",
                "refusés",
                Modifier.weight(1f),
                caption = heartbeat?.guarded?.takeIf { it > 0 }?.let { "🛡️ $it sauté(s)" } ?: "par Binance",
            )
        }
    }
}

/** Version, date d'installation et auteur. */
@Composable
fun AboutFooter() {
    val context = LocalContext.current
    val installedAt = remember { AppVersion.installedAt(context) }
    Column(
        Modifier.fillMaxWidth().padding(vertical = Spacing.l),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Hint("🧧 Red Packet Bot · version ${AppVersion.label}")
        if (installedAt > 0) Hint("installée le ${Status.dateTime(installedAt)}")
        Text(
            "Developed by Kevin Armache",
            style = MaterialTheme.typography.labelMedium,
            color = AppColors.gold,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
