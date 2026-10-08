package com.redpacketbot.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.redpacketbot.app.BotService
import com.redpacketbot.app.BotState
import com.redpacketbot.app.Status

@Composable
fun TelegramScreen() {
    val context = LocalContext.current
    val snapshot by rememberSnapshot()
    var confirmRelogin by remember { mutableStateOf(false) }
    var value by remember { mutableStateOf("") }
    // Une question n'est valable que pendant une connexion en cours
    val prompt = snapshot.prompt?.takeIf { snapshot.status == BotState.TELEGRAM_LOGIN && !snapshot.userStopped }
    val event = snapshot.state.optString("telegramEvent")

    Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Section("📡 Connexion Telegram") {
            Text(
                "Le téléphone a sa propre session Telegram, sur le même compte que le PC. " +
                    "Le code de connexion arrive dans ton app Telegram (ou par SMS).",
            )
            Hint("Numéro : ${snapshot.config.phoneNumber.ifBlank { "à remplir dans les Réglages" }}")

            when {
                snapshot.status == BotState.TELEGRAM_REQUIRED ->
                    Hint("🔑 La session du téléphone n'est plus valide : reconnecte-toi.", Red)
                event == "ok" && prompt == null ->
                    Hint(
                        "✅ Connecté : ${snapshot.state.optString("telegramName")}" +
                            snapshot.state.optString("telegramUsername").let { if (it.isBlank()) "" else " (@$it)" },
                        Green,
                    )
                snapshot.hasTelegramSession ->
                    Hint("✅ Session enregistrée sur le téléphone.", Green)
                else -> Hint("Pas encore de session sur le téléphone.")
            }

            if (prompt == null && event != "ok") {
                Status.lastError(snapshot.state)?.let { Hint("❌ $it", Red) }
            }
            if (prompt == null) {
                Button(
                    enabled = snapshot.config.isComplete && snapshot.status != BotState.TELEGRAM_LOGIN,
                    onClick = {
                        if (snapshot.hasTelegramSession) confirmRelogin = true
                        else BotService.send(context, BotService.ACTION_TELEGRAM_LOGIN)
                    },
                ) { Text(if (snapshot.hasTelegramSession) "Se reconnecter" else "Se connecter") }
                if (snapshot.status == BotState.TELEGRAM_LOGIN) Hint("⏳ Connexion en cours, envoi du code…")
                if (!snapshot.config.isComplete) Hint("Complète d'abord les Réglages.", Orange)
            } else {
                val kind = prompt.optString("kind")
                val isPassword = kind == "telegram_password"
                when (event) {
                    "code_sent" -> Hint(
                        when (snapshot.state.optString("telegramCodeVia")) {
                            "app" -> "📨 Code envoyé dans ton app Telegram (conversation « Telegram »)."
                            "sms" -> "📨 Code envoyé par SMS."
                            "call", "flash_call", "missed_call" -> "📞 Code envoyé par appel."
                            else -> "📨 Code envoyé."
                        },
                    )
                    "invalid_code" -> Hint("❌ Code incorrect, réessaie.", Red)
                    "invalid_password" -> Hint("❌ Mot de passe incorrect, réessaie.", Red)
                }
                OutlinedTextField(
                    value = value,
                    // Le mot de passe 2FA peut contenir des espaces : rien n'est retiré à la saisie
                    onValueChange = { value = it },
                    label = { Text(if (isPassword) "Mot de passe 2FA Telegram" else "Code reçu") },
                    singleLine = true,
                    visualTransformation = if (isPassword) PasswordVisualTransformation()
                    else androidx.compose.ui.text.input.VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = when {
                            isPassword -> KeyboardType.Password
                            // Code envoyé sous forme de mot ou de phrase : clavier complet
                            snapshot.state.optString("telegramCodeVia").startsWith("sms_") -> KeyboardType.Text
                            else -> KeyboardType.Number
                        },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    enabled = value.isNotBlank(),
                    onClick = {
                        // Le code : sans espaces autour ; le mot de passe : tel quel
                        val answer = if (isPassword) value else value.trim()
                        value = ""
                        BotService.send(context, BotService.ACTION_PROMPT_ANSWER) {
                            putExtra(BotService.EXTRA_PROMPT_ID, prompt.optInt("id"))
                            putExtra(BotService.EXTRA_VALUE, answer)
                        }
                    },
                ) { Text("Valider") }
            }
        }

        Section("Bon à savoir") {
            Hint("• Ne partage jamais ce code : il donne accès à ton compte.")
            Hint("• La session du téléphone apparaît dans Telegram → Réglages → Appareils.")
            Hint("• Ne copie pas la session du PC : deux appareils sur la même session se déconnectent.")
        }
    }

    if (confirmRelogin) {
        AlertDialog(
            onDismissRequest = { confirmRelogin = false },
            title = { Text("Se reconnecter ?") },
            text = { Text("La session actuelle du téléphone sera oubliée et un nouveau code sera demandé.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRelogin = false
                    BotService.send(context, BotService.ACTION_TELEGRAM_LOGIN)
                }) { Text("Oui, se reconnecter") }
            },
            dismissButton = { TextButton(onClick = { confirmRelogin = false }) { Text("Annuler") } },
        )
    }
}
