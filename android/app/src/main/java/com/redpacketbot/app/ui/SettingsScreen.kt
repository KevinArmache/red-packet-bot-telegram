package com.redpacketbot.app.ui

import android.content.ClipboardManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.redpacketbot.app.AppFiles
import com.redpacketbot.app.BotConfig
import com.redpacketbot.app.BotService

@Composable
fun SettingsScreen(importedEnv: MutableState<String?>) {
    val context = LocalContext.current
    val files = remember { AppFiles(context) }
    var config by remember { mutableStateOf(BotConfig.load(files.config)) }
    var errors by remember { mutableStateOf(emptyList<String>()) }
    var info by remember { mutableStateOf("") }
    var advanced by remember { mutableStateOf(false) }
    val snapshot by rememberSnapshot()

    fun importText(text: String?, source: String) {
        if (text.isNullOrBlank() || !text.contains("=")) {
            info = "⚠️ Rien à importer ($source) : il faut le contenu d'un fichier .env."
            return
        }
        config = config.mergeEnv(text)
        errors = config.validate()
        info = "📥 Réglages importés depuis $source : vérifie-les, puis « Enregistrer »."
    }

    // Fichier .env partagé vers l'app (« Partager » / « Ouvrir avec »)
    LaunchedEffect(importedEnv.value) {
        val text = importedEnv.value ?: return@LaunchedEffect
        importedEnv.value = null
        importText(text, "le fichier partagé")
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val text = runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes().take(200_000).toByteArray().decodeToString() }
            }.getOrNull()
            importText(text, "le fichier")
        }
    }

    Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Section("📥 Importer ton .env") {
            Hint(
                "Le plus simple : reprends le .env du PC. Envoie-le dans tes « Messages enregistrés » Telegram, " +
                    "ouvre-le sur le téléphone puis « Partager » → Red Packet Bot. Ou choisis le fichier, ou copie son contenu.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { picker.launch(arrayOf("*/*")) }) { Text("Choisir le fichier") }
                OutlinedButton(onClick = {
                    val clip = context.getSystemService(ClipboardManager::class.java).primaryClip
                    importText(clip?.getItemAt(0)?.coerceToText(context)?.toString(), "le presse-papiers")
                }) { Text("Coller") }
            }
            Hint("Le rôle reste « secours du PC » : le .env du PC n'y change rien.")
            if (info.isNotEmpty()) Hint(info)
        }

        Section("📡 Telegram") {
            Field("API_ID", config.apiId, KeyboardType.Number) { config = config.copy(apiId = it) }
            Field("API_HASH", config.apiHash) { config = config.copy(apiHash = it) }
            Field("Numéro (format +243…)", config.phoneNumber, KeyboardType.Phone) { config = config.copy(phoneNumber = it) }
            OutlinedTextField(
                value = config.targetChannels,
                onValueChange = { config = config.copy(targetChannels = it) },
                label = { Text("Canaux (un par ligne : @pseudo, lien t.me ou -100…)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            Hint("Le compte doit être abonné à chaque canal.")
        }

        Section("🔔 Alertes (ton bot @BotFather)") {
            Field("Jeton du bot d'alertes (ALERT_BOT_TOKEN)", config.alertBotToken) {
                config = config.copy(alertBotToken = it)
            }
            Hint("Envoie une fois /start à ton bot, sinon Telegram lui interdit de t'écrire.")
            Choice("Toutes les alertes (gains, relais, bilan)", config.notifyLevel == "all") {
                config = config.copy(notifyLevel = "all")
            }
            Choice("Problèmes seulement", config.notifyLevel == "problems") {
                config = config.copy(notifyLevel = "problems")
            }
            Choice("Aucune alerte", config.notifyLevel == "off") { config = config.copy(notifyLevel = "off") }
        }

        Section("🤝 Rôle du téléphone") {
            Choice("Secours du PC (recommandé)", config.botRole == "backup") { config = config.copy(botRole = "backup") }
            Hint("Le PC réclame en priorité ; le téléphone prend le relais quand le PC s'arrête.")
            Choice("Appareil seul (solo)", config.botRole == "solo") { config = config.copy(botRole = "solo") }
            Hint("⚠️ Seulement si aucun bot ne tourne sur le PC : sinon les deux réclameraient chaque code.")
        }

        Section("🛡️ Anti-blocage Binance") {
            Hint(
                "Binance bloque les Red Packets 5 h après 10 codes faux d'affilée. Le bot compte ces " +
                    "codes et agit avant. Code clair = publié en monospace, dans un lien Cryptobox ou après « Code : ».",
            )
            Choice("Garde-fou + arrêt ⛔ (recommandé)", config.antibanMode == "stop") {
                config = config.copy(antibanMode = "stop")
            }
            Hint("Codes clairs seulement au premier seuil, puis plus aucun code au second : le bot ne tape jamais le 10e code faux.")
            Choice("Garde-fou léger seul", config.antibanMode == "light") {
                config = config.copy(antibanMode = "light")
            }
            Hint("Codes clairs seulement au seuil, sans arrêt : le blocage de 5 h reste possible.")
            Field("Codes clairs seulement à partir de … codes faux (0 = jamais)", config.antibanSelectiveAt, KeyboardType.Number) {
                config = config.copy(antibanSelectiveAt = it)
            }
            if (config.antibanMode == "stop") {
                Field("Arrêt total à partir de … codes faux (9 max)", config.antibanStopAt, KeyboardType.Number) {
                    config = config.copy(antibanStopAt = it)
                }
                Field("Reprise auto après l'arrêt, en heures (0 = manuelle)", config.antibanStopResumeH, KeyboardType.Number) {
                    config = config.copy(antibanStopResumeH = it)
                }
                Hint(
                    "Reprise manuelle : réclame toi-même un code qui marche dans l'app Binance, puis envoie " +
                        "#reprendre dans tes Messages enregistrés Telegram.",
                )
            }
        }

        TextButton(onClick = { advanced = !advanced }) {
            Text(if (advanced) "▲ Masquer les options avancées" else "▼ Options avancées")
        }
        if (advanced) {
            Section("Options avancées") {
                Field("Nom dans les alertes (défaut : 📱 Téléphone)", config.botName) { config = config.copy(botName = it) }
                Field("Healthcheck (HEALTHCHECK_URL, facultatif)", config.healthcheckUrl, KeyboardType.Uri) {
                    config = config.copy(healthcheckUrl = it)
                }
                Field("Fraîcheur max d'un message (s)", config.maxMessageAgeS, KeyboardType.Number) {
                    config = config.copy(maxMessageAgeS = it)
                }
                Toggle("Explorer les groupes liés aux canaux", config.resolveLinkedChats) {
                    config = config.copy(resolveLinkedChats = it)
                }
                Toggle("Logs détaillés (DEBUG)", config.debug) { config = config.copy(debug = it) }
            }
        }

        if (errors.isNotEmpty()) {
            Section("⚠️ À corriger") { errors.forEach { Hint("• $it", Red) } }
        }
        val warnings = config.warnings()
        if (warnings.isNotEmpty()) {
            Section("💡 À vérifier") { warnings.forEach { Hint("• $it", Orange) } }
        }

        Button(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            onClick = {
                errors = config.validate()
                if (errors.isEmpty()) {
                    config.save(files.config)
                    info = if (snapshot.isRunning) {
                        BotService.send(context, BotService.ACTION_RESTART)
                        "✅ Enregistré — le bot redémarre avec les nouveaux réglages."
                    } else {
                        "✅ Enregistré."
                    }
                }
            },
        ) { Text("Enregistrer") }
        if (info.startsWith("✅")) Hint(info, Green)
    }
}

@Composable
private fun Field(label: String, value: String, keyboard: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Choice(label: String, selected: Boolean, onSelect: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(label)
    }
}

@Composable
private fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
