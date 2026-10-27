package com.redpacketbot.app.ui

import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.Backup
import com.redpacketbot.app.BinanceLoginActivity
import com.redpacketbot.app.ui.components.Banner
import com.redpacketbot.app.ui.components.CheckRow
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.ScreenList
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.components.SettingField
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing
import org.json.JSONObject

private const val STEPS = 5

/**
 * 🧭 Assistant de démarrage : Telegram → Binance → X → téléphone → alerte de
 * test. Ouvert au premier lancement (réglages vides), et depuis les Réglages.
 */
@Composable
fun WizardScreen(vm: BotViewModel, onDone: () -> Unit) {
    val context = LocalContext.current
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val health by vm.health.collectAsStateWithLifecycle()
    var step by rememberSaveable { mutableIntStateOf(0) }
    var draft by rememberSaveable(stateSaver = ConfigSaver) { mutableStateOf(vm.loadConfig()) }
    var attempted by rememberSaveable { mutableStateOf(false) }
    var pendingBackup by remember { mutableStateOf<JSONObject?>(null) }
    val errors = draft.fieldErrors()
    fun errorFor(key: String): String? =
        if (!attempted) null else errors.filter { it.first == key }.joinToString("\n") { it.second }.ifEmpty { null }

    /** Enregistre le brouillon s'il est valide. */
    fun saveDraft(): Boolean {
        attempted = true
        if (errors.isNotEmpty()) {
            Toast.makeText(context, "⚠️ ${errors.size} point(s) à corriger", Toast.LENGTH_SHORT).show()
            return false
        }
        if (draft != vm.loadConfig()) vm.saveConfig(draft)
        return true
    }

    BackHandler(enabled = step > 0) { step-- }

    pendingBackup?.let { backup ->
        RestoreDialog(vm, backup, onDismiss = { pendingBackup = null }) { message ->
            pendingBackup = null
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            if (message.startsWith("🧳")) {
                draft = vm.loadConfig()
                attempted = false
            }
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        // ── Progression ────────────────────────────────────────────────────
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.l, vertical = Spacing.s), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (step == 0) "🧭 Mise en route" else "Étape $step sur $STEPS",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onDone) { Text("Passer") }
        }
        LinearProgressIndicator(
            progress = { step / STEPS.toFloat() },
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.l),
            color = AppColors.gold,
            trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
        )

        AnimatedContent(
            targetState = step,
            transitionSpec = {
                val forward = targetState > initialState
                slideInHorizontally { if (forward) it else -it } togetherWith slideOutHorizontally { if (forward) -it else it }
            },
            modifier = Modifier.weight(1f),
            label = "wizardStep",
        ) { current ->
            ScreenList {
                when (current) {
                    0 -> item { Welcome() }
                    1 -> {
                        item { StepTitle("✈️", "Telegram", "Le compte qui lit les canaux (le même que sur le PC).") }
                        item {
                            SectionCard(title = "📥 Le plus rapide : ta sauvegarde 🧳 ou ton .env du PC") {
                                Hint("Nouveau téléphone ? Ouvre la sauvegarde épinglée par ton bot d'alertes, ou choisis-la ici.")
                                EnvImportButtons { text, source ->
                                    if (Backup.isBackup(text)) {
                                        pendingBackup = Backup.parse(text)
                                        if (pendingBackup == null) {
                                            Toast.makeText(context, "⚠️ Sauvegarde illisible ($source)", Toast.LENGTH_SHORT).show()
                                        }
                                    } else if (text.isNullOrBlank() || !text.contains("=")) {
                                        Toast.makeText(context, "⚠️ Rien à importer ($source)", Toast.LENGTH_SHORT).show()
                                    } else {
                                        draft = draft.mergeEnv(text)
                                        attempted = true
                                        Toast.makeText(context, "📥 Importé depuis $source", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                        }
                        item {
                            SectionCard(title = "✍️ Ou remplis les champs") {
                                TelegramFields(draft, { draft = it }, ::errorFor)
                                SettingField(
                                    "Canaux (un par ligne)",
                                    draft.targetChannels,
                                    { draft = draft.copy(targetChannels = it) },
                                    error = errorFor("targetChannels"),
                                    supporting = "@pseudo, lien t.me/pseudo ou ID -100…",
                                    singleLine = false,
                                    minLines = 3,
                                )
                            }
                        }
                        item {
                            SectionCard(title = "🔐 Connexion du téléphone") {
                                if (!snapshot.config.isComplete) {
                                    Hint("Enregistre d'abord les champs ci-dessus.")
                                    Button(onClick = { saveDraft() }, modifier = Modifier.fillMaxWidth()) { Text("💾 Enregistrer") }
                                } else {
                                    TelegramLoginPanel(vm, snapshot)
                                }
                            }
                        }
                    }
                    2 -> {
                        item { StepTitle("🔐", "Binance", "Le bot réclame les codes sur ton compte Binance.") }
                        item {
                            SectionCard {
                                val browser = snapshot.liveHeartbeat?.browser
                                CheckRow(
                                    when (browser) {
                                        "ready" -> true
                                        "login" -> false
                                        else -> null
                                    },
                                    "Session Binance",
                                    when (browser) {
                                        "ready" -> "Connecté : le bot peut réclamer."
                                        "login" -> "Binance demande une reconnexion."
                                        "closed" -> "Page fermée pendant la veille (normal en secours du PC)."
                                        else -> "Connecte-toi une fois : e-mail ou téléphone, mot de passe, code 2FA."
                                    },
                                )
                                Button(
                                    onClick = { context.startActivity(Intent(context, BinanceLoginActivity::class.java)) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("🔐 Se connecter à Binance") }
                                Hint("L'écran se ferme tout seul une fois connecté. Pince pour zoomer sur la page.")
                            }
                        }
                    }
                    3 -> {
                        item { StepTitle("🐦", "X (Twitter) — facultatif", "Récupère aussi les codes publiés sur X, par les notifications de l'appli X.") }
                        item {
                            SectionCard {
                                XFields(draft, { draft = it }, ::errorFor)
                                if (draft.xEnabled) XAccessPanel(vm, snapshot)
                            }
                        }
                        if (draft.xEnabled) {
                            item {
                                SectionCard(title = "🔔 Sur l'appli X") {
                                    Hint("1. Connecte-toi à X sur ce téléphone.")
                                    Hint("2. Ouvre chaque compte qui publie des codes → touche la cloche → « Tous les posts ».")
                                    Hint("3. Réglages → Applis → X → Batterie : « Sans restriction » (sinon les notifications arrivent en retard).")
                                }
                            }
                        }
                    }
                    4 -> {
                        item { StepTitle("📱", "Le téléphone", "Pour qu'Android ne coupe jamais le bot écran éteint.") }
                        item {
                            SectionCard(title = "🚨 Indispensables") {
                                HealthList(vm, health, health.items.filter { it.critical })
                            }
                        }
                        item { Hint("Les réglages recommandés (Tecno, Phone Master) sont dans 🩺 Santé.") }
                    }
                    else -> {
                        item { StepTitle("🔔", "Alerte de test", "Vérifie que le bot peut te prévenir sur Telegram.") }
                        item {
                            SectionCard {
                                val testAlert = snapshot.state.optString("testAlert")
                                CheckRow(
                                    when (testAlert) {
                                        "ok" -> true
                                        "failed", "disabled" -> false
                                        else -> null
                                    },
                                    "Alerte de test",
                                    when (testAlert) {
                                        "ok" -> "Envoyée : vérifie ton Telegram."
                                        "failed" -> "Échec : jeton du bot d'alertes, ou /start pas envoyé au bot."
                                        "disabled" -> "Alertes désactivées (jeton vide ou niveau « off »)."
                                        else -> if (snapshot.isRunning) "Envoie une alerte pour vérifier." else "Démarre d'abord le bot."
                                    },
                                )
                                if (snapshot.isRunning) {
                                    Button(onClick = { vm.testAlert() }, modifier = Modifier.fillMaxWidth()) { Text("🔔 Envoyer une alerte de test") }
                                } else {
                                    Button(
                                        enabled = snapshot.config.isComplete,
                                        onClick = { vm.start() },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) { Text("▶️ Démarrer le bot") }
                                }
                            }
                        }
                        item {
                            Banner("🎉", "C'est prêt ! Le bot tourne en arrière-plan, même app fermée.", AppColors.success)
                        }
                    }
                }
            }
        }

        // ── Boutons ────────────────────────────────────────────────────────
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Spacing.l, vertical = Spacing.m),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        ) {
            if (step > 0) {
                OutlinedButton(onClick = { step-- }, modifier = Modifier.weight(1f)) { Text("← Précédent") }
            }
            Button(
                onClick = {
                    when (step) {
                        // Telegram et X : réglages enregistrés avant de continuer
                        1, 3 -> if (saveDraft()) step++
                        STEPS -> onDone()
                        else -> step++
                    }
                },
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    when (step) {
                        0 -> "Commencer →"
                        STEPS -> "🎉 Terminer"
                        else -> "Suivant →"
                    },
                )
            }
        }
    }
}

@Composable
private fun Welcome() {
    Column(
        Modifier.fillMaxWidth().padding(top = Spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.m),
    ) {
        Text("🧧", fontSize = 88.sp)
        Text("Bienvenue dans Red Packet Bot", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text(
            "Le bot surveille tes canaux Telegram (et X si tu veux) et réclame les codes Red Packet Binance " +
                "à ta place, 24 h/24, avec un anti-blocage qui ne tape jamais le 10e code faux.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        SectionCard {
            Hint("✈️ 1. Telegram : ton compte et tes canaux")
            Hint("🔐 2. Binance : la connexion du bot")
            Hint("🐦 3. X : facultatif")
            Hint("📱 4. Le téléphone : batterie et arrière-plan")
            Hint("🔔 5. Une alerte de test")
        }
        Text("Developed by Kevin Armache", style = MaterialTheme.typography.labelMedium, color = AppColors.gold)
    }
}

@Composable
private fun StepTitle(emoji: String, title: String, subtitle: String) {
    Column(Modifier.padding(top = Spacing.m), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(emoji, fontSize = 40.sp)
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
