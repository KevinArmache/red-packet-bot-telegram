package com.redpacketbot.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.BinanceLoginActivity
import com.redpacketbot.app.BotConfig
import com.redpacketbot.app.BotState
import com.redpacketbot.app.SourceStats
import com.redpacketbot.app.Status
import com.redpacketbot.app.XNotificationListener
import com.redpacketbot.app.ui.components.Banner
import com.redpacketbot.app.ui.components.CheckRow
import com.redpacketbot.app.ui.components.EmojiBadge
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.Pill
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.ScreenList
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing

private const val DAY = 86_400_000L
private const val MAX_CHANNELS_SHOWN = 25

@Composable
fun SourcesScreen(vm: BotViewModel, focus: String, onNavigate: (String) -> Unit) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    LaunchedEffect(focus) {
        // 0 : en-tête · 1 : Telegram · 2 : Binance · 3 : canaux · 4 : X
        when (focus) {
            "binance" -> listState.animateScrollToItem(2)
            "x" -> listState.animateScrollToItem(4)
        }
    }

    ScreenList(state = listState) {
        item { ScreenHeader("📡 Sources", "D'où viennent les codes : canaux Telegram et comptes X") }
        item {
            SectionCard(title = "✈️ Telegram", subtitle = "Session du téléphone (même compte que le PC)") {
                TelegramLoginPanel(vm, snapshot)
            }
        }
        item { BinanceCard(snapshot) }
        item { ChannelsCard(snapshot, onEdit = { onNavigate(Routes.SETTINGS) }) }
        item { XCard(vm, snapshot, onEdit = { onNavigate(Routes.SETTINGS) }) }
        item { SquareChannelsCard(snapshot, onEdit = { onNavigate(Routes.SETTINGS) }) }
        item {
            SectionCard(title = "💡 Bon à savoir") {
                Hint("• Ne partage jamais le code Telegram : il donne accès à ton compte.")
                Hint("• La session du téléphone apparaît dans Telegram → Réglages → Appareils.")
                Hint("• Ne copie pas la session du PC : deux appareils sur la même session se déconnectent.")
                Hint("• X : le bot lit seulement les notifications de l'appli X, rien d'autre n'est lu ni gardé.")
            }
        }
    }
}

// ─── Telegram ───────────────────────────────────────────────────────────────

/** Connexion Telegram du téléphone : état, bouton, saisie du code / mot de passe 2FA. */
@Composable
fun TelegramLoginPanel(vm: BotViewModel, snapshot: Snapshot) {
    var confirmRelogin by rememberSaveable { mutableStateOf(false) }
    var value by rememberSaveable { mutableStateOf("") }
    // Une question n'est valable que pendant une connexion en cours
    val prompt = snapshot.prompt?.takeIf { snapshot.status == BotState.TELEGRAM_LOGIN && !snapshot.userStopped }
    val event = snapshot.state.optString("telegramEvent")

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        Hint("📞 Numéro : ${snapshot.config.phoneNumber.ifBlank { "à remplir dans les Réglages" }}")
        when {
            snapshot.status == BotState.TELEGRAM_REQUIRED ->
                Banner("🔑", "La session du téléphone n'est plus valide : reconnecte-toi.", AppColors.danger)
            event == "ok" && prompt == null -> Banner(
                "✅",
                "Connecté : ${snapshot.state.optString("telegramName")}" +
                    snapshot.state.optString("telegramUsername").let { if (it.isBlank()) "" else " (@$it)" },
                AppColors.success,
            )
            snapshot.hasTelegramSession -> Banner("✅", "Session enregistrée sur le téléphone.", AppColors.success)
            else -> Banner("📭", "Pas encore de session sur le téléphone : le code arrivera dans ton app Telegram.", AppColors.info)
        }
        if (prompt == null && event != "ok") {
            Status.lastError(snapshot.state)?.let { Hint("❌ $it", AppColors.danger) }
        }

        if (prompt == null) {
            Button(
                enabled = snapshot.config.isComplete && snapshot.status != BotState.TELEGRAM_LOGIN,
                onClick = { if (snapshot.hasTelegramSession) confirmRelogin = true else vm.telegramLogin() },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (snapshot.hasTelegramSession) "🔄 Se reconnecter" else "🔐 Se connecter à Telegram") }
            if (snapshot.status == BotState.TELEGRAM_LOGIN) Hint("⏳ Connexion en cours, envoi du code…")
            if (!snapshot.config.isComplete) Hint("Complète d'abord les Réglages (API_ID, API_HASH, numéro, canaux).", AppColors.warning)
        } else {
            val isPassword = prompt.optString("kind") == "telegram_password"
            when (event) {
                "code_sent" -> Hint(
                    when (snapshot.state.optString("telegramCodeVia")) {
                        "app" -> "📨 Code envoyé dans ton app Telegram (conversation « Telegram »)."
                        "sms" -> "📨 Code envoyé par SMS."
                        "call", "flash_call", "missed_call" -> "📞 Code envoyé par appel."
                        else -> "📨 Code envoyé."
                    },
                )
                "invalid_code" -> Hint("❌ Code incorrect, réessaie.", AppColors.danger)
                "invalid_password" -> Hint("❌ Mot de passe incorrect, réessaie.", AppColors.danger)
            }
            OutlinedTextField(
                value = value,
                // Le mot de passe 2FA peut contenir des espaces : rien n'est retiré à la saisie
                onValueChange = { value = it },
                label = { Text(if (isPassword) "🔒 Mot de passe 2FA Telegram" else "🔢 Code reçu") },
                singleLine = true,
                visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(
                    keyboardType = when {
                        isPassword -> KeyboardType.Password
                        // Code envoyé sous forme de mot ou de phrase : clavier complet
                        snapshot.state.optString("telegramCodeVia").startsWith("sms_") -> KeyboardType.Text
                        else -> KeyboardType.Number
                    },
                ),
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                enabled = value.isNotBlank(),
                onClick = {
                    // Le code : sans espaces autour ; le mot de passe : tel quel
                    val answer = if (isPassword) value else value.trim()
                    value = ""
                    vm.answerPrompt(prompt.optInt("id"), answer)
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("✅ Valider") }
        }
    }

    if (confirmRelogin) {
        AlertDialog(
            onDismissRequest = { confirmRelogin = false },
            title = { Text("🔄 Se reconnecter ?") },
            text = { Text("La session actuelle du téléphone sera oubliée et un nouveau code sera demandé.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRelogin = false
                    vm.telegramLogin()
                }) { Text("Oui, se reconnecter") }
            },
            dismissButton = { TextButton(onClick = { confirmRelogin = false }) { Text("Annuler") } },
        )
    }
}

/** 🔐 Session Binance du bot : état et écran de connexion. */
@Composable
private fun BinanceCard(snapshot: Snapshot) {
    val context = LocalContext.current
    val browser = snapshot.liveHeartbeat?.browser
    SectionCard(title = "🔐 Binance", subtitle = "Là où le bot réclame les codes") {
        CheckRow(
            when (browser) {
                "ready" -> true
                "login" -> false
                else -> null
            },
            "Session Binance",
            when (browser) {
                "ready" -> "Connecté : le bot peut réclamer."
                "login" -> "Binance demande une reconnexion : les codes sont ignorés en attendant."
                "starting" -> "Ouverture de la page Cryptobox…"
                "closed" -> "Page fermée pendant la veille (normal quand le PC réclame)."
                else -> if (snapshot.isRunning) "État inconnu." else "Bot arrêté."
            },
        )
        OutlinedButton(
            onClick = { context.startActivity(Intent(context, BinanceLoginActivity::class.java)) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (browser == "ready") "🔐 Ouvrir la connexion Binance" else "🔐 Se connecter à Binance") }
    }
}

/** Canaux surveillés et leur activité (stats par canal, canaux muets signalés). */
@Composable
private fun ChannelsCard(snapshot: Snapshot, onEdit: () -> Unit) {
    var showAll by rememberSaveable { mutableStateOf(false) }
    val now = System.currentTimeMillis()
    val stats = snapshot.activity.sources.filter { it.origin == "telegram" }
    val byKey = stats.associateBy { sourceKey(it.name) }
    val rows = snapshot.config.channelList.map { channel ->
        val bare = BotConfig.bareChannel(channel)
        bare to byKey[bare.lowercase()]
    }.sortedByDescending { it.second?.lastMsgAt ?: 0L }
    val since = snapshot.activity.since
    val silent = rows.count { (_, s) -> s == null || now - s.lastMsgAt > 7 * DAY }

    SectionCard(
        title = "📢 Canaux surveillés",
        subtitle = "${rows.size} canal(aux)" + if (since > 0) " · stats depuis le ${Status.dateTime(since)}" else "",
        trailing = { TextButton(onClick = onEdit) { Text("✏️ Modifier") } },
    ) {
        if (rows.isEmpty()) {
            Hint("Aucun canal : ajoute-les dans les Réglages (@pseudo, lien t.me ou ID -100…).")
        }
        if (silent > 0 && since > 0 && now - since > DAY) {
            Hint("😶 $silent canal(aux) sans message depuis 7 jours (ou jamais vu) : ils ne servent peut-être plus.", AppColors.warning)
        }
        val shown = if (showAll) rows else rows.take(MAX_CHANNELS_SHOWN)
        shown.forEachIndexed { index, (name, s) ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            SourceRow("✈️", if (name.matches(Regex("-?\\d+"))) name else "@$name", s, now)
        }
        if (rows.size > MAX_CHANNELS_SHOWN) {
            TextButton(onClick = { showAll = !showAll }) {
                Text(if (showAll) "Réduire" else "Voir les ${rows.size - MAX_CHANNELS_SHOWN} autres")
            }
        }
    }
}

/** 🧧 Canaux de liens Binance Square : ils ne donnent jamais de code. */
@Composable
private fun SquareChannelsCard(snapshot: Snapshot, onEdit: () -> Unit) {
    val now = System.currentTimeMillis()
    val config = snapshot.config
    val byKey = snapshot.activity.sources.filter { it.origin == "telegram" }.associateBy { sourceKey(it.name) }
    SectionCard(
        title = "🧧 Binance Square",
        subtitle = "Canaux de liens : le bot n'y cherche jamais de code",
        trailing = { TextButton(onClick = onEdit) { Text("✏️ Modifier") } },
    ) {
        if (!config.squareEnabled) {
            Hint("Désactivé dans les Réglages.")
            return@SectionCard
        }
        config.squareChannelList.forEachIndexed { index, channel ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            val bare = BotConfig.bareChannel(channel)
            SourceRow("🧧", if (bare.matches(Regex("-?\\d+"))) bare else "@$bare", byKey[bare.lowercase()], now)
        }
        Hint("Abonne le compte Telegram de ce téléphone à ces canaux, sinon Telegram ne lui envoie rien.")
        Hint("Un lien Square publié dans tes canaux de codes arrive aussi dans l'onglet 🧧 Square.")
    }
}

/** « @pseudo (groupe lié) » → « pseudo » : comparable à un canal des réglages. */
private fun sourceKey(name: String) = name.removePrefix("🐦 ").substringBefore(" ").removePrefix("@").lowercase()

@Composable
private fun SourceRow(emoji: String, name: String, s: SourceStats?, now: Long) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        EmojiBadge(emoji, size = 32)
        Column(Modifier.weight(1f).padding(start = Spacing.m)) {
            Text(name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val detail = when {
                s == null || s.lastMsgAt == 0L -> "aucun message vu"
                now - s.lastMsgAt > 7 * DAY -> "😶 muet ${Format.ago(s.lastMsgAt, now)}"
                else -> "dernier message ${Format.ago(s.lastMsgAt, now)}"
            }
            Hint(detail, if (s == null || now - s.lastMsgAt > 7 * DAY) AppColors.warning else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("🎁 ${s?.detected ?: 0}", style = MaterialTheme.typography.labelMedium)
            Text("🏆 ${s?.won ?: 0}", style = MaterialTheme.typography.labelMedium, color = AppColors.gold)
        }
    }
}

// ─── X (Twitter) ────────────────────────────────────────────────────────────

/** 🐦 Lecture des notifications de l'appli X : état, accès, comptes, dernier post. */
@Composable
private fun XCard(vm: BotViewModel, snapshot: Snapshot, onEdit: () -> Unit) {
    val now = System.currentTimeMillis()
    val config = snapshot.config
    val heartbeat = snapshot.liveHeartbeat
    SectionCard(
        title = "🐦 X (Twitter)",
        subtitle = "Notifications de l'appli X, sans scraping ni API",
        trailing = {
            Pill(
                when {
                    !config.xEnabled -> "désactivé"
                    config.xDryRun -> "🧪 essai à blanc"
                    else -> "actif"
                },
                when {
                    !config.xEnabled -> AppColors.idle
                    config.xDryRun -> AppColors.info
                    else -> AppColors.success
                },
            )
        },
    ) {
        if (!config.xEnabled) {
            Hint(
                "Active « 🐦 X » dans les Réglages : le téléphone lira les posts des comptes que tu suis avec la " +
                    "cloche « Tous les posts », et le PC recevra les codes s'il réclame.",
            )
            OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) { Text("⚙️ Activer dans les Réglages") }
            return@SectionCard
        }
        XAccessPanel(vm, snapshot)
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        val x = snapshot.xListener
        if (x.lastPostAt > 0) {
            Text("📝 Dernier post vu", style = MaterialTheme.typography.titleSmall)
            Hint("${x.lastFrom.ifBlank { "compte inconnu" }} · ${Format.ago(x.lastPostAt, now)}")
            if (x.lastExcerpt.isNotBlank()) Hint("« ${x.lastExcerpt} »")
            // Compte rendu du bot pour ce post (même post si l'heure concorde)
            if (heartbeat != null && heartbeat.xLastAt > 0 && heartbeat.xLastFound > 0) {
                val known = heartbeat.xLastKnown
                Hint(
                    "🎁 ${heartbeat.xLastFound} code(s) dans ce post" + when {
                        known == 0 -> " : tous nouveaux, envoyés à Binance"
                        known == heartbeat.xLastFound -> " : tous déjà réclamés plus tôt (Telegram ou X)"
                        else -> ", dont $known déjà réclamé(s) plus tôt"
                    },
                    AppColors.success,
                )
            } else if (heartbeat != null && heartbeat.xLastAt > 0) {
                Hint("Aucun code dans ce post.")
            }
        } else {
            Hint("📝 Aucun post X reçu depuis le démarrage du bot.")
        }
        if (x.dropped > 0) Hint("⚠️ ${x.dropped} post(s) arrivé(s) bot arrêté : ignorés.", AppColors.warning)
        Hint("🎁 Codes trouvés sur X depuis le démarrage : ${heartbeat?.xCodes ?: 0}")

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        val stats = snapshot.activity.sources.filter { it.origin == "x" }
        val byKey = stats.associateBy { sourceKey(it.name) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("👥 Comptes suivis", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onEdit) { Text("✏️ Modifier") }
        }
        if (config.xAccountList.isEmpty()) {
            Hint("Tous les comptes avec la cloche (suggestions de X comprises) : une liste est conseillée.", AppColors.warning)
            stats.sortedByDescending { it.lastMsgAt }.take(10).forEach { s -> SourceRow("🐦", s.name.removePrefix("🐦 "), s, now) }
        } else {
            config.xAccountList.forEach { handle -> SourceRow("🐦", "@$handle", byKey[handle], now) }
        }
        Hint("🔔 Sur X : ouvre chaque compte → cloche → « Tous les posts ». Sans ça, X n'envoie rien.")
    }
}

/** Accès aux notifications + appli X installée : ce qu'il faut pour lire X. */
@Composable
fun XAccessPanel(vm: BotViewModel, snapshot: Snapshot) {
    val context = LocalContext.current
    val installed = XNotificationListener.isXInstalled(context)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        CheckRow(
            snapshot.xAccess,
            "Accès aux notifications",
            if (snapshot.xAccess) {
                if (snapshot.xListener.connected) "Accordé · lecture active" else "Accordé · en attente d'Android"
            } else {
                "À accorder : sans lui, le bot ne voit pas les posts X."
            },
        ) {
            if (!snapshot.xAccess) {
                OutlinedButton(onClick = {
                    open(context, XNotificationListener.settingsIntent(context))
                    vm.refreshHealth()
                }) { Text("Autoriser") }
            }
        }
        if (!snapshot.xAccess) {
            Hint(
                "Interrupteur grisé (« paramètre restreint ») ? Réglages → Applis → Red Packet Bot → ⋮ → " +
                    "« Autoriser les paramètres restreints », puis réessaie.",
            )
        }
        CheckRow(
            installed,
            "Appli X installée",
            if (installed) "Connecte-toi et active la cloche sur les comptes à suivre." else "Installe X depuis le Play Store.",
        ) {
            if (!installed) {
                OutlinedButton(onClick = {
                    open(context, Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${XNotificationListener.X_PACKAGE}")))
                }) { Text("Installer") }
            }
        }
    }
}

/** Ouvre un écran des réglages Android (repli : la fiche de l'app). */
fun open(context: Context, intent: Intent?) {
    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
    try {
        context.startActivity((intent ?: fallback).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        context.startActivity(fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: SecurityException) {
        context.startActivity(fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
