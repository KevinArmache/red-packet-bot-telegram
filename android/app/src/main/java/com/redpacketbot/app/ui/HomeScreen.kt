package com.redpacketbot.app.ui

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.redpacketbot.app.AppVersion
import com.redpacketbot.app.BinanceLoginActivity
import com.redpacketbot.app.BotService
import com.redpacketbot.app.BotState
import com.redpacketbot.app.Health
import com.redpacketbot.app.MainActivity
import com.redpacketbot.app.Status

@Composable
fun HomeScreen(onNavigate: (String) -> Unit) {
    val context = LocalContext.current
    val snapshot by rememberSnapshot()
    val heartbeat = snapshot.heartbeat
    val (title, text) = Status.describe(snapshot.state, heartbeat?.takeIf { snapshot.isRunning })

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Section(title) {
            if (text.isNotBlank()) Text(text)
            if (!snapshot.isRunning || snapshot.status != BotState.RUNNING) {
                Status.lastError(snapshot.state)?.let { Hint("❌ $it", Red) }
            }
            if (snapshot.isRunning && heartbeat != null) {
                Hint("Dernier signe de vie : il y a ${Status.ago(heartbeat.ageMs)}")
                Hint("Messages analysés : ${heartbeat.messages} · coupures Telegram : ${heartbeat.disconnects}")
                if (heartbeat.sleeps > 0) {
                    Hint("💤 Android a endormi le bot ${heartbeat.sleeps} fois : vérifie l'écran Santé.", Orange)
                }
            }
            Hint(
                if (snapshot.config.botRole == "solo") "Rôle : appareil seul (solo)"
                else "Rôle : secours du PC (le PC réclame en priorité)",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (snapshot.isRunning || snapshot.status == BotState.RESTARTING ||
                    snapshot.status == BotState.TELEGRAM_REQUIRED
                ) {
                    Button(
                        onClick = { BotService.send(context, BotService.ACTION_STOP) },
                        colors = ButtonDefaults.buttonColors(containerColor = Red),
                    ) { Text("⏹️ Arrêter") }
                    OutlinedButton(onClick = { BotService.send(context, BotService.ACTION_RESTART) }) {
                        Text("🔄 Redémarrer")
                    }
                } else {
                    Button(
                        enabled = snapshot.config.isComplete,
                        onClick = { BotService.send(context, BotService.ACTION_START) },
                        colors = ButtonDefaults.buttonColors(containerColor = Green),
                    ) { Text("▶️ Démarrer") }
                }
            }
        }

        Section("Mise en route") {
            CheckRow(
                snapshot.config.isComplete, "1. Réglages",
                if (snapshot.config.isComplete) "${snapshot.config.channelList.size} canal(aux) surveillé(s)"
                else "Importe ton .env ou remplis les champs.",
            ) { OutlinedButton(onClick = { onNavigate(MainActivity.SCREEN_SETTINGS) }) { Text("Ouvrir") } }

            val telegramOk = snapshot.hasTelegramSession && snapshot.status != BotState.TELEGRAM_REQUIRED
            CheckRow(
                telegramOk, "2. Connexion Telegram",
                when {
                    snapshot.status == BotState.TELEGRAM_REQUIRED -> "Session expirée : reconnecte-toi."
                    telegramOk -> snapshot.state.optString("telegramName").ifEmpty { "Session enregistrée" }
                    else -> "Le code arrive dans ton app Telegram."
                },
            ) { OutlinedButton(onClick = { onNavigate(MainActivity.SCREEN_TELEGRAM) }) { Text("Ouvrir") } }

            val browser = heartbeat?.takeIf { snapshot.isRunning }?.browser
            CheckRow(
                when (browser) {
                    "ready" -> true
                    "login" -> false
                    else -> null
                },
                "3. Connexion Binance",
                when (browser) {
                    "ready" -> "Session Binance active"
                    "login" -> "Binance demande une reconnexion"
                    "closed" -> "Page fermée pendant la veille (normal en secours du PC)"
                    else -> "Connecte-toi une fois dans l'app."
                },
            ) {
                OutlinedButton(onClick = {
                    context.startActivity(Intent(context, BinanceLoginActivity::class.java))
                }) { Text("Ouvrir") }
            }

            val failing = Health.check(context).count { it.ok == false }
            CheckRow(
                failing == 0, "4. Santé du téléphone",
                if (failing == 0) "Réglages automatiques OK (vérifie aussi les points Tecno)"
                else "$failing réglage(s) à corriger",
            ) { OutlinedButton(onClick = { onNavigate(MainActivity.SCREEN_HEALTH) }) { Text("Ouvrir") } }

            val testAlert = snapshot.state.optString("testAlert")
            CheckRow(
                when (testAlert) {
                    "ok" -> true
                    "failed", "disabled" -> false
                    else -> null
                },
                "5. Alerte de test",
                when (testAlert) {
                    "ok" -> "Envoyée : vérifie ton Telegram"
                    "failed" -> "Échec : jeton du bot d'alertes, ou /start pas envoyé au bot"
                    "disabled" -> "Alertes désactivées (jeton vide ou niveau « off »)"
                    else -> if (snapshot.isRunning) "Envoie une alerte pour vérifier" else "Démarre d'abord le bot"
                },
            ) {
                OutlinedButton(
                    enabled = snapshot.isRunning,
                    onClick = { BotService.send(context, BotService.ACTION_TEST_ALERT) },
                ) { Text("Envoyer") }
            }
        }

        Text(
            "Le bot tourne en arrière-plan, même app fermée. Seul « Arrêter » l'arrête durablement.",
            fontSize = 13.sp,
            fontWeight = FontWeight.Light,
            modifier = Modifier.padding(8.dp),
        )
        val installedAt = remember { AppVersion.installedAt(context) }
        Text(
            "Version ${AppVersion.label}" +
                (if (installedAt > 0) ", installée le ${Status.dateTime(installedAt)}" else "") + ".",
            fontSize = 12.sp,
            color = Color.DarkGray,
            modifier = Modifier.padding(start = 8.dp, end = 8.dp, bottom = 8.dp),
        )
    }
}
