package com.redpacketbot.app.ui

import android.content.ClipboardManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.redpacketbot.app.BotConfig
import com.redpacketbot.app.ui.components.Banner
import com.redpacketbot.app.ui.components.ChoiceGroup
import com.redpacketbot.app.ui.components.ChoiceOption
import com.redpacketbot.app.ui.components.GroupLabel
import com.redpacketbot.app.ui.components.Hint
import com.redpacketbot.app.ui.components.InfoRow
import com.redpacketbot.app.ui.components.ScreenHeader
import com.redpacketbot.app.ui.components.ScreenList
import com.redpacketbot.app.ui.components.SectionCard
import com.redpacketbot.app.ui.components.SettingField
import com.redpacketbot.app.ui.components.StickySaveBar
import com.redpacketbot.app.ui.components.SwitchRow
import com.redpacketbot.app.ui.theme.AppColors
import com.redpacketbot.app.ui.theme.Spacing
import org.json.JSONObject

/** Brouillon des réglages gardé à la rotation et au passage clair/sombre. */
val ConfigSaver = Saver<BotConfig, String>(
    save = { it.toJson().toString() },
    restore = { BotConfig.fromJson(JSONObject(it)) },
)

@Composable
fun SettingsScreen(vm: BotViewModel, importedEnv: MutableState<String?>, onNavigate: (String) -> Unit) {
    val context = LocalContext.current
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    var saved by rememberSaveable(stateSaver = ConfigSaver) { mutableStateOf(vm.loadConfig()) }
    var draft by rememberSaveable(stateSaver = ConfigSaver) { mutableStateOf(saved) }
    var attempted by rememberSaveable { mutableStateOf(false) }
    var advanced by rememberSaveable { mutableStateOf(false) }
    var info by rememberSaveable { mutableStateOf("") }

    val errors = draft.fieldErrors()
    val draftJson = draft.toJson()
    val savedJson = saved.toJson()
    /** Erreur du champ, affichée après une tentative d'enregistrement ou dès qu'il est modifié. */
    fun errorFor(key: String): String? {
        if (!attempted && draftJson.opt(key) == savedJson.opt(key)) return null
        return errors.filter { it.first == key }.joinToString("\n") { it.second }.ifEmpty { null }
    }

    fun importText(text: String?, source: String) {
        if (text.isNullOrBlank() || !text.contains("=")) {
            info = "⚠️ Rien à importer ($source) : il faut le contenu d'un fichier .env."
            return
        }
        draft = draft.mergeEnv(text)
        attempted = true
        info = "📥 Réglages importés depuis $source : vérifie-les, puis « Enregistrer »."
    }

    // 📣 Canal créé par le bouton « Créer mon canal » : le service l'a déjà enregistré
    val createdChannel = snapshot.state.optJSONObject("channelSetup")?.optString("channel").orEmpty()
    LaunchedEffect(createdChannel) {
        if (createdChannel.isEmpty() || saved.publishChannel == createdChannel) return@LaunchedEffect
        // Seulement si c'est encore le réglage enregistré (pas un ancien canal effacé depuis)
        if (vm.loadConfig().publishChannel != createdChannel) return@LaunchedEffect
        saved = saved.copy(publishChannel = createdChannel)
        if (draft.publishChannel.isBlank()) draft = draft.copy(publishChannel = createdChannel)
    }

    // Fichier .env partagé vers l'app (« Partager » / « Ouvrir avec »)
    LaunchedEffect(importedEnv.value) {
        val text = importedEnv.value ?: return@LaunchedEffect
        importedEnv.value = null
        importText(text, "le fichier partagé")
    }

    fun save() {
        attempted = true
        if (errors.isNotEmpty()) {
            Toast.makeText(context, "⚠️ ${errors.size} point(s) à corriger (en rouge)", Toast.LENGTH_SHORT).show()
            return
        }
        val restarting = vm.saveConfig(draft)
        saved = draft
        attempted = false
        info = ""
        Toast.makeText(
            context,
            if (restarting) "✅ Enregistré — le bot redémarre avec les nouveaux réglages." else "✅ Enregistré.",
            Toast.LENGTH_LONG,
        ).show()
    }

    Box(Modifier.fillMaxSize().imePadding()) {
        ScreenList(bottomPadding = 120) {
            item { ScreenHeader("⚙️ Réglages", "Mêmes noms que le .env du PC") }

            item {
                SectionCard(title = "📥 Importer ton .env", subtitle = "Le plus simple : reprends celui du PC") {
                    Hint(
                        "Envoie le .env du PC dans tes « Messages enregistrés » Telegram, ouvre-le sur le téléphone puis " +
                            "« Partager » → Red Packet Bot. Ou choisis le fichier, ou copie son contenu.",
                    )
                    EnvImportButtons(::importText)
                    Hint("Le rôle reste « secours du PC » : le .env du PC n'y change rien.")
                    if (info.isNotEmpty()) Hint(info, if (info.startsWith("⚠️")) AppColors.warning else AppColors.info)
                }
            }

            item { GroupLabel("Telegram") }
            item {
                SectionCard(title = "✈️ Compte Telegram", subtitle = "my.telegram.org → API development tools") {
                    TelegramFields(draft, { draft = it }, ::errorFor)
                }
            }
            item {
                SectionCard(title = "📢 Canaux surveillés", subtitle = "${draft.channelList.size} canal(aux)") {
                    SettingField(
                        "Canaux (un par ligne)",
                        draft.targetChannels,
                        { draft = draft.copy(targetChannels = it) },
                        error = errorFor("targetChannels"),
                        supporting = "@pseudo, lien t.me/pseudo ou ID -100… · le compte doit y être abonné",
                        singleLine = false,
                        minLines = 4,
                    )
                }
            }

            item { GroupLabel("X (Twitter)") }
            item {
                SectionCard(title = "🐦 Codes publiés sur X", subtitle = "Notifications de l'appli X, sans scraping ni API") {
                    XFields(draft, { draft = it }, ::errorFor)
                    if (draft.xEnabled) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        XAccessPanel(vm, snapshot)
                    }
                }
            }

            item { GroupLabel("Affichage") }
            item { CurrencyCard(vm) }

            item { GroupLabel("Alertes et relais") }
            item {
                SectionCard(title = "🔔 Alertes Telegram", subtitle = "Ton bot créé avec @BotFather") {
                    SettingField(
                        "Jeton du bot d'alertes (ALERT_BOT_TOKEN)",
                        draft.alertBotToken,
                        { draft = draft.copy(alertBotToken = it) },
                        error = errorFor("alertBotToken"),
                        supporting = "Envoie une fois /start à ton bot, sinon Telegram lui interdit de t'écrire.",
                        secret = true,
                    )
                    ChoiceGroup(
                        listOf(
                            ChoiceOption("all", "🔔", "Toutes les alertes", "Gains, relais, bilan quotidien"),
                            ChoiceOption("problems", "⚠️", "Problèmes seulement"),
                            ChoiceOption("off", "🔕", "Aucune alerte"),
                        ),
                        draft.notifyLevel,
                    ) { draft = draft.copy(notifyLevel = it) }
                }
            }
            item {
                SectionCard(title = "📣 Publier mes gains", subtitle = "Sur ton canal Telegram, par ton bot d'alertes") {
                    PublishFields(vm, snapshot, draft, saved, { draft = it }, ::errorFor)
                }
            }
            item {
                SectionCard(title = "🤝 Rôle du téléphone") {
                    ChoiceGroup(
                        listOf(
                            ChoiceOption("backup", "📱", "Secours du PC (recommandé)", "Le PC réclame en priorité ; le téléphone prend le relais quand il s'arrête."),
                            ChoiceOption("solo", "🎯", "Appareil seul (solo)", "⚠️ Seulement si aucun bot ne tourne sur le PC : sinon les deux réclameraient chaque code."),
                        ),
                        draft.botRole,
                    ) { draft = draft.copy(botRole = it) }
                }
            }

            item { GroupLabel("Sécurité Binance") }
            item {
                SectionCard(
                    title = "🛡️ Anti-blocage Binance",
                    subtitle = "Binance bloque les Red Packets 5 h après 10 codes faux d'affilée",
                ) {
                    AntibanFields(draft, { draft = it }, ::errorFor)
                }
            }

            item { GroupLabel("Avancé") }
            item {
                SectionCard(
                    title = "🧰 Options avancées",
                    trailing = { TextButton(onClick = { advanced = !advanced }) { Text(if (advanced) "▲ Masquer" else "▼ Afficher") } },
                ) {
                    if (advanced) {
                        SettingField("Nom dans les alertes (défaut : 📱 Téléphone)", draft.botName, { draft = draft.copy(botName = it) })
                        SettingField(
                            "Healthcheck (HEALTHCHECK_URL, facultatif)",
                            draft.healthcheckUrl,
                            { draft = draft.copy(healthcheckUrl = it) },
                            keyboard = KeyboardType.Uri,
                        )
                        SettingField(
                            "Fraîcheur max d'un message (s)",
                            draft.maxMessageAgeS,
                            { draft = draft.copy(maxMessageAgeS = it) },
                            error = errorFor("maxMessageAgeS"),
                            keyboard = KeyboardType.Number,
                        )
                        SwitchRow("🔗", "Groupes liés aux canaux", "Écoute aussi les groupes de discussion des canaux", draft.resolveLinkedChats) {
                            draft = draft.copy(resolveLinkedChats = it)
                        }
                        SwitchRow("🐞", "Logs détaillés (DEBUG)", "Plus de lignes dans l'onglet Activité → Logs", draft.debug) {
                            draft = draft.copy(debug = it)
                        }
                    } else {
                        Hint("Nom de l'appareil, healthcheck, fraîcheur des messages, groupes liés, logs détaillés.")
                    }
                }
            }

            val warnings = draft.warnings()
            if (warnings.isNotEmpty()) {
                item {
                    SectionCard(title = "💡 À vérifier") { warnings.forEach { Hint("• $it", AppColors.warning) } }
                }
            }

            item { GroupLabel("Plus") }
            item {
                SectionCard {
                    InfoRow("🩺", "Santé du téléphone", "Batterie, arrière-plan, réglages Tecno", onClick = { onNavigate(Routes.HEALTH) }) {
                        Text("›", style = MaterialTheme.typography.titleLarge)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    InfoRow("🧭", "Relancer l'assistant de démarrage", "Telegram, Binance, X, téléphone, alerte de test", onClick = { onNavigate(Routes.WIZARD) }) {
                        Text("›", style = MaterialTheme.typography.titleLarge)
                    }
                }
            }
            item {
                SectionCard(title = "ℹ️ À propos") {
                    AboutFooter()
                    Hint("Police Inter (SIL Open Font License 1.1).")
                }
            }
        }

        StickySaveBar(
            visible = draft != saved,
            errorCount = if (attempted) errors.size else 0,
            onSave = ::save,
            onDiscard = {
                draft = saved
                attempted = false
                info = ""
            },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

/**
 * 💱 Devise des gains : dollar, franc congolais ou les deux. Appliquée tout de
 * suite (préférence de l'app, le bot n'est pas redémarré).
 */
@Composable
private fun CurrencyCard(vm: BotViewModel) {
    val money by vm.money.collectAsStateWithLifecycle()
    var manual by rememberSaveable { mutableStateOf(money.manualRate?.let { Format.amount(it) } ?: "") }
    SectionCard(title = "💱 Devise des gains", subtitle = "Appliquée tout de suite, sans redémarrer le bot") {
        ChoiceGroup(
            listOf(
                ChoiceOption(MoneyPrefs.USD, "💵", "Dollar américain ($)"),
                ChoiceOption(MoneyPrefs.CDF, "🇨🇩", "Franc congolais (FC)"),
                ChoiceOption(MoneyPrefs.BOTH, "💱", "Les deux", "Dollar en grand, francs congolais dessous"),
            ),
            money.mode,
        ) { vm.setCurrency(it) }
        if (money.wantsCdf) {
            val rate = money.cdfRate
            when {
                money.manualRate != null -> Hint("✍️ Ton taux : 1 $ = ${Format.cdf(money.manualRate!!)}")
                money.autoRate != null -> Hint(
                    "📈 Taux du jour : 1 $ = ${Format.cdf(money.autoRate!!)} · ${Format.ago(money.autoRateAt)} " +
                        "(open.er-api.com)",
                )
                else -> Hint("⏳ Taux en cours de lecture… sans Internet, les montants restent en dollars.", AppColors.warning)
            }
            SettingField(
                "Ton taux (FC pour 1 $), facultatif",
                manual,
                {
                    manual = it
                    vm.setManualRate(it)
                },
                supporting = "Vide = taux du jour. Remplis-le pour utiliser le taux de ton changeur.",
                keyboard = KeyboardType.Decimal,
            )
            if (money.manualRate == null) {
                TextButton(onClick = { vm.refreshCdfRate(force = true) }) { Text("🔄 Actualiser le taux du jour") }
            }
            if (rate != null) Hint("Exemple : 0,30 $ ≈ ${Format.cdf(0.30 * rate)}")
        }
    }
}

/** Boutons d'import du .env : fichier ou presse-papiers. */
@Composable
fun EnvImportButtons(onText: (String?, String) -> Unit) {
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val text = runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes().take(200_000).toByteArray().decodeToString() }
            }.getOrNull()
            onText(text, "le fichier")
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
        OutlinedButton(onClick = { picker.launch(arrayOf("*/*")) }) { Text("📂 Choisir le fichier") }
        OutlinedButton(onClick = {
            val clip = context.getSystemService(ClipboardManager::class.java).primaryClip
            onText(clip?.getItemAt(0)?.coerceToText(context)?.toString(), "le presse-papiers")
        }) { Text("📋 Coller") }
    }
}

/** API_ID, API_HASH, numéro. */
@Composable
fun TelegramFields(config: BotConfig, onChange: (BotConfig) -> Unit, errorFor: (String) -> String?) {
    SettingField("API_ID", config.apiId, { onChange(config.copy(apiId = it)) }, error = errorFor("apiId"), keyboard = KeyboardType.Number)
    SettingField("API_HASH", config.apiHash, { onChange(config.copy(apiHash = it)) }, error = errorFor("apiHash"), secret = true)
    SettingField(
        "Numéro (format +243…)",
        config.phoneNumber,
        { onChange(config.copy(phoneNumber = it)) },
        error = errorFor("phoneNumber"),
        keyboard = KeyboardType.Phone,
    )
}

/**
 * 📣 Ton canal de gains : le champ, la création en un appui (ton compte crée
 * le canal, ton bot d'alertes y est mis administrateur), puis la vérification.
 */
@Composable
fun PublishFields(
    vm: BotViewModel,
    snapshot: Snapshot,
    config: BotConfig,
    saved: BotConfig,
    onChange: (BotConfig) -> Unit,
    errorFor: (String) -> String?,
) {
    var title by rememberSaveable { mutableStateOf("🧧 Red Packet Codes") }
    var username by rememberSaveable { mutableStateOf("") }
    val setup = snapshot.state.optJSONObject("channelSetup")
    val setupState = setup?.optString("state").orEmpty()
    // « En cours » oublié après 2 min (bot relancé pendant la création)
    val creating = setupState == "running" && System.currentTimeMillis() - (setup?.optLong("at") ?: 0L) < 120_000

    SettingField(
        "Ton canal (PUBLISH_CHANNEL)",
        config.publishChannel,
        { onChange(config.copy(publishChannel = it)) },
        error = errorFor("publishChannel"),
        supporting = "Vide = rien n'est publié · @pseudo, lien t.me/pseudo ou ID -100…",
    )

    if (saved.publishChannel.isBlank()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Hint(
            "Pas encore de canal ? Le bot le crée pour toi avec ton compte Telegram, y met ton bot d'alertes " +
                "administrateur et remplit le champ : rien d'autre à faire.",
        )
        SettingField("Nom du canal", title, { title = it })
        SettingField(
            "@pseudo public (facultatif)",
            username,
            { username = it },
            supporting = "Pour le lien t.me/pseudo · pris ? une variante est essayée · vide = canal privé",
        )
        when {
            saved.alertBotToken.isBlank() ->
                Hint("Mets d'abord le jeton du bot d'alertes (carte 🔔 ci-dessus) et enregistre : c'est lui qui publie.", AppColors.warning)
            !snapshot.isRunning -> Hint("Démarre d'abord le bot : il crée le canal avec ta connexion Telegram.", AppColors.warning)
            else -> Button(
                onClick = { vm.setupChannel(title.trim(), username.trim()) },
                enabled = !creating && config.publishChannel.isBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (creating) "⏳ Création du canal…" else "✨ Créer mon canal") }
        }
        if (setupState == "failed") Hint("⚠️ ${setup?.optString("text")}", AppColors.warning)
    } else {
        val channel = BotConfig.normalizedChannel(saved.publishChannel)
        val check = snapshot.state.optJSONObject("publishCheck")
            ?.takeIf { it.optString("channel").equals(channel, ignoreCase = true) }
        when (check?.opt("ok")) {
            true -> Hint("✅ ${check.optString("text")}", AppColors.success)
            false -> Hint("⚠️ ${check.optString("text")}", AppColors.warning)
            else -> if (check != null) Hint("⏳ ${check.optString("text")}", AppColors.info)
        }
        if (channel.startsWith("@")) Hint("🔗 Lien à partager : t.me/${channel.removePrefix("@")}")
        if (snapshot.isRunning) {
            OutlinedButton(onClick = { vm.checkChannel() }) { Text("🔎 Vérifier que mon bot peut publier") }
        }
    }
    Hint(
        "Chaque gain y part tout de suite, avec son code copiable : « 🧧 Red Packet réclamé ! " +
            "🎁 Code : ABCD1234 · 💰 Gain : 0,52 USDT (≈ 0,52 $) ». Canal créé à la main ? Ajoute ton bot d'alertes " +
            "comme administrateur, avec le droit « Publier des messages ».",
    )
}

/** 🐦 Lecture de X : activation, comptes, essai à blanc. */
@Composable
fun XFields(config: BotConfig, onChange: (BotConfig) -> Unit, errorFor: (String) -> String?) {
    SwitchRow(
        "🐦",
        "Lire les posts X",
        "Comptes suivis avec la cloche « Tous les posts » dans l'appli X",
        config.xEnabled,
    ) { onChange(config.copy(xEnabled = it)) }
    if (config.xEnabled) {
        SettingField(
            "Comptes X (séparés par des virgules)",
            config.xAccounts,
            { onChange(config.copy(xAccounts = it)) },
            error = errorFor("xAccounts"),
            supporting = "Ex. @binance, @binance_fr · vide = tous les comptes avec la cloche",
            singleLine = false,
            minLines = 2,
        )
        SwitchRow(
            "🧪",
            "Essai à blanc",
            "Tout fonctionne mais aucun code X n'est tapé sur Binance : pour tester sans risque",
            config.xDryRun,
        ) { onChange(config.copy(xDryRun = it)) }
        if (config.xDryRun) {
            Banner("🧪", "Essai à blanc actif : pense à le couper une fois les tests faits.", AppColors.info)
        }
    }
}

/** Mode et seuils de l'anti-blocage (jamais le 10e code faux). */
@Composable
private fun AntibanFields(config: BotConfig, onChange: (BotConfig) -> Unit, errorFor: (String) -> String?) {
    Hint("Code clair = publié en monospace, dans un lien Cryptobox ou après « Code : ».")
    ChoiceGroup(
        listOf(
            ChoiceOption("stop", "⛔", "Garde-fou + arrêt (recommandé)", "Codes clairs seulement au premier seuil, puis plus aucun code : le 10e code faux n'est jamais tapé."),
            ChoiceOption("light", "🟠", "Garde-fou léger seul", "Codes clairs seulement au seuil, sans arrêt : le blocage de 5 h reste possible."),
        ),
        config.antibanMode,
    ) { onChange(config.copy(antibanMode = it)) }
    SettingField(
        "Codes clairs seulement à partir de … codes faux (0 = jamais)",
        config.antibanSelectiveAt,
        { onChange(config.copy(antibanSelectiveAt = it)) },
        error = errorFor("antibanSelectiveAt"),
        keyboard = KeyboardType.Number,
    )
    if (config.antibanMode == "stop") {
        SettingField(
            "Arrêt total à partir de … codes faux (9 max)",
            config.antibanStopAt,
            { onChange(config.copy(antibanStopAt = it)) },
            error = errorFor("antibanStopAt"),
            keyboard = KeyboardType.Number,
        )
        SettingField(
            "Reprise auto après l'arrêt, en heures (0 = manuelle)",
            config.antibanStopResumeH,
            { onChange(config.copy(antibanStopResumeH = it)) },
            error = errorFor("antibanStopResumeH"),
            keyboard = KeyboardType.Number,
            supporting = "Manuelle : réclame toi-même un code qui marche dans l'app Binance, puis envoie #reprendre dans tes Messages enregistrés.",
        )
    }
}
